const express = require('express');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { Media } = require('../models/Social');
const { rateLimit } = require('../middleware/rateLimit');
const { cleanString, isObjectId, clampNumber, escapeRegex } = require('../utils/validation');
const { blockedEitherWay } = require('../utils/social');
const {
  findMembership,
  membersOf,
  createMessage,
  markChatRead,
  serializeChat,
} = require('../utils/chatService');

const router = express.Router();
const sendLimiter = rateLimit({ windowMs: 60_000, max: 90, keyPrefix: 'msg' });

const POPULATE = [
  { path: 'sender', select: 'name username avatarUrl phone' },
  { path: 'replyTo', select: 'content sender type media deletedAt' },
];

function isDirectChat(chat) {
  return !chat.isGroup && chat.members.length === 2;
}

async function directPartnerId(chat, meId) {
  return membersOf(chat).find((id) => id !== String(meId));
}

/* -------------------------------- create ---------------------------------- */

router.post('/', sendLimiter, async (req, res) => {
  try {
    const { chat: chatId, content, type, replyTo, media, forwarded } = req.body || {};
    if (!isObjectId(chatId)) return res.status(400).json({ message: 'Invalid chat' });

    const chat = await findMembership(chatId, req.user.id);
    if (!chat) return res.status(403).json({ message: 'You are not a member of this chat' });

    if (isDirectChat(chat)) {
      const partnerId = await directPartnerId(chat, req.user.id);
      if (partnerId && (await blockedEitherWay(req.user.id, partnerId))) {
        return res.status(403).json({ message: 'This conversation is no longer available' });
      }
    }

    const allowedTypes = ['text', 'image', 'file', 'audio', 'video', 'sticker'];
    const msgType = allowedTypes.includes(type) ? type : 'text';
    const text = cleanString(content, 5000);

    let mediaPayload;
    if (media && (media.url || media.mediaId)) {
      const record = isObjectId(String(media.mediaId || '')) ? await Media.findById(media.mediaId) : null;
      if (record) {
        if (String(record.owner) !== String(req.user.id)) {
          return res.status(403).json({ message: 'You can only send files you uploaded' });
        }
        // Bind the media to this chat so only members can fetch it.
        record.chat = chat._id;
        record.scope = 'chat';
        await record.save();
        mediaPayload = {
          mediaId: record._id,
          url: `/api/media/${record._id}`,
          name: record.originalName,
          mime: record.mime,
          size: record.size,
          duration: Number(media.duration) || undefined,
        };
      } else if (typeof media.url === 'string' && media.url.startsWith('/api/media/')) {
        mediaPayload = {
          url: cleanString(media.url, 300),
          name: cleanString(media.name, 200),
          mime: cleanString(media.mime, 100),
          size: Number(media.size) || undefined,
          duration: Number(media.duration) || undefined,
        };
      }
    }

    if (!text && !mediaPayload) return res.status(400).json({ message: 'Message cannot be empty' });

    let replyToId;
    if (replyTo && isObjectId(String(replyTo))) {
      const parent = await Message.findOne({ _id: replyTo, chat: chat._id }).select('_id');
      if (parent) replyToId = parent._id;
    }

    const message = await createMessage({
      io: req.app.get('io'),
      chat,
      senderId: req.user.id,
      content: text,
      type: mediaPayload ? (mediaPayload.mime?.startsWith('image/') ? 'image' : mediaPayload.mime?.startsWith('video/') ? 'video' : mediaPayload.mime?.startsWith('audio/') ? 'audio' : msgType) : msgType,
      replyTo: replyToId,
      media: mediaPayload,
      forwarded: !!forwarded,
    });

    res.status(201).json(message);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* --------------------------------- search --------------------------------- */

router.get('/search', async (req, res) => {
  try {
    const q = cleanString(req.query.q, 100);
    if (!q) return res.json({ messages: [] });
    const limit = clampNumber(req.query.limit, 1, 50, 30);

    const chatFilter = { members: req.user.id };
    if (req.query.chat) {
      if (!isObjectId(req.query.chat)) return res.status(400).json({ message: 'Invalid chat' });
      const member = await findMembership(req.query.chat, req.user.id);
      if (!member) return res.status(403).json({ message: 'Not authorized' });
      chatFilter._id = member._id;
    }
    const chats = await Chat.find(chatFilter).select('_id').lean();

    const messages = await Message.find({
      chat: { $in: chats.map((c) => c._id) },
      deletedAt: null,
      content: new RegExp(escapeRegex(q), 'i'),
    })
      .populate(POPULATE)
      .populate('chat', 'name isGroup')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ messages });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* ---------------------------------- read ---------------------------------- */

router.get('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid message' });
    const message = await Message.findById(req.params.id).populate(POPULATE);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    const member = await findMembership(message.chat, req.user.id);
    if (!member) return res.status(403).json({ message: 'Not authorized' });
    res.json(message);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* ---------------------------------- edit ---------------------------------- */

router.put('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid message' });
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    const member = await findMembership(message.chat, req.user.id);
    if (!member) return res.status(403).json({ message: 'Not authorized' });
    if (String(message.sender) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }
    if (message.deletedAt) return res.status(400).json({ message: 'Message was deleted' });
    if (message.type !== 'text') return res.status(400).json({ message: 'Only text messages can be edited' });

    const content = cleanString(req.body?.content, 5000);
    if (!content) return res.status(400).json({ message: 'Message cannot be empty' });

    message.content = content;
    message.editedAt = new Date();
    await message.save();

    const payload = await Message.findById(message._id).populate(POPULATE).lean();
    req.app.get('io')?.to(`chat:${message.chat}`).emit('message:updated', payload);
    res.json(payload);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* --------------------------------- delete --------------------------------- */

router.delete('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid message' });
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    const member = await findMembership(message.chat, req.user.id);
    if (!member) return res.status(403).json({ message: 'Not authorized' });
    if (String(message.sender) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }

    // Soft delete keeps ordering and read receipts coherent for the other side.
    message.deletedAt = new Date();
    message.content = '';
    message.media = undefined;
    message.reactions = [];
    await message.save();

    const payload = await Message.findById(message._id).populate(POPULATE).lean();
    req.app.get('io')?.to(`chat:${message.chat}`).emit('message:updated', payload);
    res.json({ message: 'Message deleted', id: String(message._id) });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* -------------------------------- reactions -------------------------------- */

router.post('/:id/reactions', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid message' });
    const emoji = cleanString(req.body?.emoji, 8);
    if (!emoji) return res.status(400).json({ message: 'Pick an emoji' });

    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    const member = await findMembership(message.chat, req.user.id);
    if (!member) return res.status(403).json({ message: 'Not authorized' });

    const existing = (message.reactions || []).find((r) => String(r.user) === String(req.user.id));
    if (existing && existing.emoji === emoji) {
      message.reactions = message.reactions.filter((r) => String(r.user) !== String(req.user.id));
    } else {
      message.reactions = [
        ...(message.reactions || []).filter((r) => String(r.user) !== String(req.user.id)),
        { user: req.user.id, emoji },
      ];
    }
    await message.save();

    const payload = await Message.findById(message._id).populate(POPULATE).lean();
    req.app.get('io')?.to(`chat:${message.chat}`).emit('message:updated', payload);
    res.json(payload);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* -------------------------------- receipts --------------------------------- */

router.post('/:id/read', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid message' });
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    const member = await findMembership(message.chat, req.user.id);
    if (!member) return res.status(403).json({ message: 'Not authorized' });
    await markChatRead(req.app.get('io'), member, req.user.id);
    res.json({ message: 'Marked as read' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/:id/delivered', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid message' });
    const message = await Message.findById(req.params.id).select('chat');
    if (!message) return res.status(404).json({ message: 'Message not found' });
    const member = await findMembership(message.chat, req.user.id);
    if (!member) return res.status(403).json({ message: 'Not authorized' });
    await Message.updateOne({ _id: message._id }, { $addToSet: { deliveredTo: req.user.id } });
    req.app.get('io')?.to(`chat:${message.chat}`).emit('message:delivered', {
      messageId: String(message._id),
      userId: String(req.user.id),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* -------------------------------- forward --------------------------------- */

router.post('/:id/forward', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid message' });
    const targetIds = (Array.isArray(req.body?.chatIds) ? req.body.chatIds : []).filter(isObjectId);
    if (!targetIds.length) return res.status(400).json({ message: 'Choose at least one chat' });

    const original = await Message.findById(req.params.id);
    if (!original) return res.status(404).json({ message: 'Message not found' });
    const sourceMember = await findMembership(original.chat, req.user.id);
    if (!sourceMember) return res.status(403).json({ message: 'Not authorized' });
    if (original.deletedAt) return res.status(400).json({ message: 'Cannot forward a deleted message' });

    const results = [];
    for (const targetId of targetIds) {
      const chat = await findMembership(targetId, req.user.id);
      if (!chat) continue;
      const created = await createMessage({
        io: req.app.get('io'),
        chat,
        senderId: req.user.id,
        content: original.content,
        type: original.type === 'text' ? 'text' : original.type,
        media: original.media,
        forwarded: true,
        forwardedFrom: original.sender,
      });
      results.push(created);
      void (await serializeChat(chat, req.user.id));
    }

    if (!results.length) return res.status(403).json({ message: 'You are not a member of those chats' });
    res.status(201).json({ message: `Forwarded to ${results.length} chat(s)`, messages: results });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
