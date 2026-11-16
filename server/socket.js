const Chat = require('./models/Chat');
const User = require('./models/User');
const Message = require('./models/Message');
const { verifyToken } = require('./middleware/auth');
const { addSocket, removeSocket, isOnline } = require('./utils/presence');
const { createMessage, findMembership, membersOf } = require('./utils/chatService');
const { FriendRequest, Friendship } = require('./models/Social');
const { areFriends } = require('./utils/social');
const { notify } = require('./utils/notify');
const { cleanString, isObjectId } = require('./utils/validation');

const TYPING_TTL_MS = 5000;

async function relatedUserIds(userId) {
  const [friendships, chats, requests] = await Promise.all([
    Friendship.find({ users: userId }).select('users').lean(),
    Chat.find({ members: userId }).select('members').limit(100).lean(),
    FriendRequest.find({ status: 'pending', $or: [{ from: userId }, { to: userId }] })
      .select('from to')
      .lean(),
  ]);
  const ids = new Set();
  friendships.forEach((f) => f.users.forEach((u) => String(u) !== String(userId) && ids.add(String(u))));
  chats.forEach((c) => c.members.forEach((u) => String(u) !== String(userId) && ids.add(String(u))));
  requests.forEach((r) => {
    if (String(r.from) !== String(userId)) ids.add(String(r.from));
    if (String(r.to) !== String(userId)) ids.add(String(r.to));
  });
  return [...ids].slice(0, 300);
}

async function broadcastPresence(io, userId, online) {
  const targets = await relatedUserIds(userId);
  for (const target of targets) {
    io.to(`user:${target}`).emit('presence:changed', { userId: String(userId), online });
  }
}

async function canCall(meId, otherId) {
  if (!isObjectId(otherId) || String(meId) === String(otherId)) return false;
  const [{ Block }, { areFriends: friendsCheck }] = [require('./models/Social'), require('./utils/social')];
  const blocked = await Block.exists({
    $or: [
      { blocker: meId, blocked: otherId },
      { blocker: otherId, blocked: meId },
    ],
  });
  if (blocked) return false;
  return friendsCheck(meId, otherId);
}

function attachSocket(io) {
  // Every socket must present a valid JWT; identity always comes from the token.
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('Missing token'));
      const payload = verifyToken(String(token));
      socket.userId = String(payload.id);
      next();
    } catch (e) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    const socketCount = addSocket(userId, socket.id);
    socket.join(`user:${userId}`);

    if (socketCount === 1) {
      User.updateOne({ _id: userId }, { $set: { online: true, lastActiveAt: new Date() } }).catch(() => {});
      broadcastPresence(io, userId, true).catch(() => {});
    }

    // The client may announce which chat it opened; membership is re-verified here.
    socket.on('chat:join', async (chatId) => {
      if (!isObjectId(String(chatId || ''))) return;
      const chat = await Chat.exists({ _id: chatId, members: userId });
      if (!chat) return socket.emit('error', { message: 'You are not a member of this chat' });
      socket.join(`chat:${chatId}`);
    });

    socket.on('chat:leave', (chatId) => {
      if (chatId) socket.leave(`chat:${chatId}`);
    });

    // Kept for compatibility with the original client: identity is taken from the socket.
    socket.on('user:join', () => {
      socket.join(`user:${userId}`);
    });

    socket.on('message:new', async (payload = {}) => {
      try {
        const chatId = payload.chatId || payload.chat;
        const chat = await findMembership(chatId, userId);
        if (!chat) return socket.emit('error', { message: 'You are not a member of this chat' });
        const created = await createMessage({
          io,
          chat,
          senderId: userId,
          content: cleanString(payload.content, 5000),
          type: ['text', 'image', 'file', 'audio', 'video', 'sticker'].includes(payload.type)
            ? payload.type
            : 'text',
        });
        socket.emit('message:ack', { tempId: payload.tempId, message: created });
      } catch (e) {
        socket.emit('error', { message: 'Failed to create message' });
      }
    });

    socket.on('typing', async ({ chatId, typing }) => {
      if (!isObjectId(String(chatId || ''))) return;
      const chat = await Chat.exists({ _id: chatId, members: userId }).select('_id');
      if (!chat) return;
      socket.to(`chat:${chatId}`).emit('typing', {
        chatId: String(chatId),
        userId,
        typing: !!typing,
      });
    });

    socket.on('message:read', async ({ chatId }) => {
      if (!isObjectId(String(chatId || ''))) return;
      const chat = await findMembership(chatId, userId);
      if (!chat) return;
      const now = new Date();
      await Message.updateMany(
        { chat: chat._id, sender: { $ne: userId }, readBy: { $ne: userId } },
        { $addToSet: { readBy: userId, seenBy: userId, deliveredTo: userId } }
      );
      await Chat.updateOne({ _id: chat._id, 'reads.user': userId }, { $set: { 'reads.$.lastReadAt': now } });
      io.to(`chat:${chat._id}`).emit('chat:read', { chatId: String(chat._id), userId, at: now });
    });

    socket.on('presence:ping', async () => {
      await User.updateOne({ _id: userId }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
      socket.emit('presence:pong', { at: Date.now() });
    });

    /* ------------------------------ WebRTC calls ----------------------------- */

    socket.on('call:invite', async (payload = {}) => {
      try {
        const { toUserId, chatId, media = 'audio', offer, callId } = payload;
        if (!(await canCall(userId, toUserId))) {
          return socket.emit('call:error', { message: 'You can only call your friends' });
        }
        if (chatId && !(await Chat.exists({ _id: chatId, members: userId }))) {
          return socket.emit('call:error', { message: 'Not authorized for this chat' });
        }
        const me = await User.findById(userId).select('name avatarUrl');
        if (!isOnline(toUserId)) {
          await notify(io, {
            user: toUserId,
            type: 'call',
            title: `Missed ${media} call from ${me?.name || 'someone'}`,
            data: { chatId: chatId || null, callId },
          });
          return socket.emit('call:unavailable', { reason: 'User is offline' });
        }
        io.to(`user:${toUserId}`).emit('call:incoming', {
          callId,
          from: { _id: userId, name: me?.name || 'Unknown', avatarUrl: me?.avatarUrl || null },
          chatId: chatId || null,
          media,
          offer,
        });
      } catch (e) {
        socket.emit('call:error', { message: 'Unable to start the call' });
      }
    });

    const relay = (event, outEvent, extra) => {
      socket.on(event, (payload = {}) => {
        const { toUserId } = payload;
        if (!isObjectId(String(toUserId || ''))) return;
        io.to(`user:${toUserId}`).emit(outEvent, { ...payload, fromUserId: userId, ...(extra || {}) });
      });
    };

    relay('call:answer', 'call:answer');
    relay('call:ice', 'call:ice');
    relay('call:reject', 'call:rejected');
    relay('call:end', 'call:ended');

    socket.on('call:busy', ({ toUserId, callId }) => {
      if (isObjectId(String(toUserId || ''))) io.to(`user:${toUserId}`).emit('call:busy', { callId });
    });

    /* ------------------------------- cleanup -------------------------------- */

    socket.on('disconnect', async () => {
      const remaining = removeSocket(userId, socket.id);
      if (remaining === 0) {
        await User.updateOne({ _id: userId }, { $set: { online: false, lastActiveAt: new Date() } }).catch(() => {});
        broadcastPresence(io, userId, false).catch(() => {});
      }
    });
  });
}

module.exports = { attachSocket, TYPING_TTL_MS };
// Re-exported for tests that want the pure helper.
module.exports.membersOf = membersOf;
module.exports.areFriends = areFriends;
