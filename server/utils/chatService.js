const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { isOnline } = require('./presence');

const MEMBER_FIELDS = 'name username avatarUrl bio gender birthdate online lastActiveAt statusMessage';

/** Chat the user is actually a member of, or null. Every chat/message route starts here. */
function findMembership(chatId, userId) {
  return Chat.findOne({ _id: chatId, members: userId });
}

function membersOf(chat) {
  return (chat.members || []).map((m) => String(m._id || m));
}

function lastReadAtFor(chat, userId) {
  const row = (chat.reads || []).find((r) => String(r.user) === String(userId));
  return row?.lastReadAt || new Date(0);
}

async function unreadCountFor(chat, userId) {
  const since = lastReadAtFor(chat, userId);
  return Message.countDocuments({
    chat: chat._id,
    sender: { $ne: userId },
    deletedAt: null,
    createdAt: { $gt: since },
  });
}

function baseChat(chat, userId) {
  const id = String(userId);
  return {
    _id: chat._id,
    name: chat.name,
    isGroup: !!chat.isGroup,
    avatarUrl: chat.avatarUrl || null,
    description: chat.description || '',
    members: (chat.members || [])
      .filter((m) => m && m._id)
      .map((m) => ({ ...m.toPublicProfile && typeof m.toPublicProfile === 'function' ? m.toPublicProfile(true) : m })),
    admins: (chat.admins || []).map(String),
    createdBy: chat.createdBy ? String(chat.createdBy) : null,
    lastMessage: chat.lastMessage || null,
    pinned: (chat.pinnedBy || []).some((u) => String(u) === id) || (!!chat.pinned && false),
    muted: (chat.mutedBy || []).some((u) => String(u) === id),
    isAdmin: (chat.admins || []).some((u) => String(u) === id),
    updatedAt: chat.updatedAt,
    createdAt: chat.createdAt,
  };
}

/** Full payload for one chat, including per-viewer unread count. */
async function serializeChat(chat, viewerId) {
  const populated = await Chat.findById(chat._id)
    .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'name username avatarUrl' } })
    .populate('members', MEMBER_FIELDS);
  if (!populated) return null;
  const payload = baseChat(populated, viewerId);
  payload.unreadCount = await unreadCountFor(chat, viewerId);
  return payload;
}

async function serializeChats(chats, viewerId) {
  return Promise.all(chats.map((c) => serializeChat(c, viewerId)));
}

function emitToMembers(io, chat, event, payload) {
  if (!io) return;
  for (const memberId of membersOf(chat)) {
    io.to(`user:${memberId}`).emit(event, payload);
  }
}

/**
 * Creates a message, updates the chat's lastMessage and fans out realtime events.
 * Sender identity is always supplied by the server, never by the client.
 */
async function createMessage({ io, chat, senderId, content = '', type = 'text', replyTo, media, forwarded = false, forwardedFrom }) {
  const memberIds = membersOf(chat);
  const deliveredTo = memberIds.filter((id) => String(id) === String(senderId) || isOnline(id));

  const message = await Message.create({
    chat: chat._id,
    sender: senderId,
    content: typeof content === 'string' ? content.slice(0, 5000) : '',
    type,
    replyTo: replyTo || undefined,
    media: media || undefined,
    forwarded: !!forwarded,
    forwardedFrom: forwardedFrom || undefined,
    deliveredTo,
    readBy: [senderId],
    seenBy: [senderId],
  });

  await Chat.updateOne(
    { _id: chat._id },
    {
      lastMessage: message._id,
      updatedAt: new Date(),
      // A new message un-hides the chat for members who left a group earlier.
      $pull: { leftBy: { $in: memberIds } },
    }
  );

  const populated = await Message.findById(message._id)
    .populate('sender', MEMBER_FIELDS)
    .populate({ path: 'replyTo', select: 'content sender type media deletedAt' })
    .lean();

  if (io) {
    io.to(`chat:${chat._id}`).emit('message:created', populated);
    const chatPayload = await serializeChat(chat, senderId);
    for (const memberId of memberIds) {
      io.to(`user:${memberId}`).emit('chat:updated', {
        ...(await serializeChat(chat, memberId)),
      });
    }
    void chatPayload;
  }

  return populated;
}

/** Marks a chat read for one user and reports which messages became read. */
async function markChatRead(io, chat, userId) {
  const now = new Date();
  await Chat.updateOne(
    { _id: chat._id, 'reads.user': userId },
    { $set: { 'reads.$.lastReadAt': now } }
  );
  await Chat.updateOne(
    { _id: chat._id, 'reads.user': { $ne: userId } },
    { $push: { reads: { user: userId, lastReadAt: now } } }
  );

  await Message.updateMany(
    { chat: chat._id, sender: { $ne: userId }, readBy: { $ne: userId }, deletedAt: null },
    { $addToSet: { readBy: userId, seenBy: userId, deliveredTo: userId } }
  );

  if (io) {
    io.to(`chat:${chat._id}`).emit('chat:read', { chatId: String(chat._id), userId: String(userId), at: now });
  }
  return now;
}

async function publicMembers(ids) {
  return User.find({ _id: { $in: ids } }).select(MEMBER_FIELDS);
}

module.exports = {
  findMembership,
  membersOf,
  serializeChat,
  serializeChats,
  emitToMembers,
  createMessage,
  markChatRead,
  publicMembers,
  MEMBER_FIELDS,
};
