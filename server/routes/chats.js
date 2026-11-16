const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { areFriends, blockedEitherWay } = require('../utils/social');
const { cleanString, isObjectId, clampNumber } = require('../utils/validation');
const { notify } = require('../utils/notify');
const {
  findMembership,
  membersOf,
  serializeChat,
  serializeChats,
  emitToMembers,
  markChatRead,
} = require('../utils/chatService');
const router = express.Router();

/* --------------------------------- create --------------------------------- */

router.post('/', async (req, res) => {
  try {
    const isGroup = !!req.body?.isGroup;
    const rawMembers = Array.isArray(req.body?.members) ? req.body.members : [];
    const memberIds = [...new Set([...rawMembers.map(String), String(req.user.id)])].filter(isObjectId);
    if (memberIds.length < 2) return res.status(400).json({ message: 'A chat needs at least two people' });

    if (!isGroup) {
      if (memberIds.length > 2) return res.status(400).json({ message: 'Direct chats have exactly two members' });
      const otherId = memberIds.find((id) => id !== String(req.user.id));
      if (!otherId) return res.status(400).json({ message: 'Choose someone to chat with' });

      const other = await User.findById(otherId);
      if (!other || other.disabled) return res.status(404).json({ message: 'User not found' });
      if (await blockedEitherWay(req.user.id, otherId)) {
        return res.status(403).json({ message: 'You cannot message this user' });
      }

      // Existing conversations stay reachable; new ones respect privacy settings.
      const directKey = Chat.directKeyFor(req.user.id, otherId);
      const existing = await Chat.findOne({ directKey });
      if (existing) return res.json(await serializeChat(existing, req.user.id));

      const friends = await areFriends(req.user.id, otherId);
      const openToEveryone = other.privacy?.messagesFrom === 'everyone';
      if (!friends && !openToEveryone) {
        return res.status(403).json({ message: 'Become friends with this person to start a chat' });
      }

      const chat = await Chat.create({
        directKey,
        name: cleanString(req.body?.name, 80) || `${other.name} & me`,
        isGroup: false,
        members: [req.user.id, otherId],
        createdBy: req.user.id,
        reads: [{ user: req.user.id, lastReadAt: new Date() }],
      });
      emitToMembers(req.app.get('io'), chat, 'chat:created', await serializeChat(chat, req.user.id));
      return res.status(201).json(await serializeChat(chat, req.user.id));
    }

    const name = cleanString(req.body?.name, 80);
    if (!name) return res.status(400).json({ message: 'Group name is required' });
    const users = await User.find({ _id: { $in: memberIds } }).select('_id');
    if (users.length !== memberIds.length) return res.status(400).json({ message: 'Some members do not exist' });

    const chat = await Chat.create({
      name,
      isGroup: true,
      members: memberIds,
      admins: [req.user.id],
      createdBy: req.user.id,
      description: cleanString(req.body?.description, 500),
      avatarUrl: cleanString(req.body?.avatarUrl, 500) || undefined,
      reads: [{ user: req.user.id, lastReadAt: new Date() }],
    });

    const io = req.app.get('io');
    const me = await User.findById(req.user.id).select('name');
    for (const memberId of memberIds.filter((id) => id !== String(req.user.id))) {
      notify(io, {
        user: memberId,
        type: 'group_added',
        title: `${me?.name || 'Someone'} added you to ${name}`,
        data: { chatId: String(chat._id) },
      });
    }
    emitToMembers(io, chat, 'chat:created', await serializeChat(chat, req.user.id));
    res.status(201).json(await serializeChat(chat, req.user.id));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* ---------------------------------- list ---------------------------------- */

router.get('/', async (req, res) => {
  try {
    // Always scoped to the authenticated user — the old `?member=` escape hatch is gone.
    const limit = clampNumber(req.query.limit, 1, 100, 50);
    const chats = await Chat.find({ members: req.user.id }).sort({ updatedAt: -1 }).limit(limit);
    res.json(await serializeChats(chats, req.user.id));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid chat' });
    const chat = await findMembership(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    res.json(await serializeChat(chat, req.user.id));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* ------------------------------- preferences ------------------------------ */

router.put('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid chat' });
    const chat = await findMembership(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const isAdmin = (chat.admins || []).some((a) => String(a) === String(req.user.id));

    if (typeof req.body?.pinned === 'boolean') {
      await Chat.updateOne(
        { _id: chat._id },
        req.body.pinned
          ? { $addToSet: { pinnedBy: req.user.id } }
          : { $pull: { pinnedBy: req.user.id } }
      );
    }
    if (typeof req.body?.muted === 'boolean') {
      await Chat.updateOne(
        { _id: chat._id },
        req.body.muted
          ? { $addToSet: { mutedBy: req.user.id } }
          : { $pull: { mutedBy: req.user.id } }
      );
    }

    if (chat.isGroup) {
      const wantsMetaChange =
        req.body?.name !== undefined || req.body?.description !== undefined || req.body?.avatarUrl !== undefined;
      if (wantsMetaChange && !isAdmin) {
        return res.status(403).json({ message: 'Only group admins can edit group details' });
      }
      const update = {};
      if (req.body?.name !== undefined) {
        const name = cleanString(req.body.name, 80);
        if (!name) return res.status(400).json({ message: 'Group name cannot be empty' });
        update.name = name;
      }
      if (req.body?.description !== undefined) update.description = cleanString(req.body.description, 500);
      if (req.body?.avatarUrl !== undefined) update.avatarUrl = cleanString(req.body.avatarUrl, 500) || undefined;
      if (Object.keys(update).length) await Chat.updateOne({ _id: chat._id }, { $set: update });
    }

    const fresh = await findMembership(req.params.id, req.user.id);
    const payload = await serializeChat(fresh, req.user.id);
    if (io_available(req)) emitToMembers(req.app.get('io'), chat, 'chat:updated', payload);
    res.json(payload);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

function io_available(req) {
  return !!req.app.get('io');
}

/* -------------------------------- leave/del -------------------------------- */

router.delete('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid chat' });
    const chat = await findMembership(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const remaining = membersOf(chat).filter((id) => id !== String(req.user.id));

    if (chat.isGroup && remaining.length > 0) {
      const admins = (chat.admins || []).map(String).filter((id) => id !== String(req.user.id));
      const nextAdmins = admins.length ? admins : [remaining[0]];
      // $pull and $set cannot touch the same path in one update.
      await Chat.updateOne(
        { _id: chat._id },
        { $pull: { members: req.user.id }, $set: { admins: nextAdmins } }
      );
      emitToMembers(req.app.get('io'), chat, 'chat:updated', { _id: chat._id, systemEvent: 'member_left' });
    } else if (remaining.length === 0) {
      await Message.deleteMany({ chat: chat._id });
      await Chat.deleteOne({ _id: chat._id });
    } else {
      // Direct chat: hide it for this user only; the other side keeps history.
      await Chat.updateOne({ _id: chat._id }, { $pull: { members: req.user.id, admins: req.user.id } });
    }

    res.sendStatus(204);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* --------------------------------- members -------------------------------- */

router.post('/:id/members', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid chat' });
    const chat = await findMembership(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.isGroup) return res.status(400).json({ message: 'Not a group chat' });
    const isAdmin = (chat.admins || []).some((a) => String(a) === String(req.user.id));
    if (!isAdmin) return res.status(403).json({ message: 'Only admins can add members' });

    const ids = (Array.isArray(req.body?.userIds) ? req.body.userIds : [req.body?.userId]).filter(isObjectId);
    if (!ids.length) return res.status(400).json({ message: 'Choose at least one person' });
    if (await blockedEitherWay(req.user.id, ids[0])) {
      return res.status(403).json({ message: 'You cannot add this user' });
    }

    const users = await User.find({ _id: { $in: ids } }).select('_id name');
    if (!users.length) return res.status(404).json({ message: 'User not found' });

    await Chat.updateOne({ _id: chat._id }, { $addToSet: { members: { $each: ids } } });

    const me = await User.findById(req.user.id).select('name');
    for (const u of users) {
      notify(req.app.get('io'), {
        user: u._id,
        type: 'group_added',
        title: `${me?.name || 'Someone'} added you to ${chat.name}`,
        data: { chatId: String(chat._id) },
      });
    }

    const fresh = await findMembership(req.params.id, req.user.id);
    const payload = await serializeChat(fresh, req.user.id);
    emitToMembers(req.app.get('io'), fresh, 'chat:updated', payload);
    res.json(payload);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/:id/members/:userId', async (req, res) => {
  try {
    if (!isObjectId(req.params.id) || !isObjectId(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid chat or user' });
    }
    const chat = await findMembership(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.isGroup) return res.status(400).json({ message: 'Not a group chat' });

    const isAdmin = (chat.admins || []).some((a) => String(a) === String(req.user.id));
    const removingSelf = String(req.params.userId) === String(req.user.id);
    if (!isAdmin && !removingSelf) return res.status(403).json({ message: 'Only admins can remove members' });

    await Chat.updateOne(
      { _id: chat._id },
      { $pull: { members: req.params.userId, admins: req.params.userId } }
    );
    const fresh = await findMembership(req.params.id, req.user.id);
    if (fresh) {
      const payload = await serializeChat(fresh, req.user.id);
      req.app.get('io')?.to(`user:${req.params.userId}`).emit('chat:removed', { chatId: String(chat._id) });
      emitToMembers(req.app.get('io'), fresh, 'chat:updated', payload);
    }
    res.json({ message: 'Member removed' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/:id/admins/:userId', async (req, res) => {
  try {
    if (!isObjectId(req.params.id) || !isObjectId(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid chat or user' });
    }
    const chat = await findMembership(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    if (!chat.isGroup) return res.status(400).json({ message: 'Not a group chat' });
    const isAdmin = (chat.admins || []).some((a) => String(a) === String(req.user.id));
    if (!isAdmin) return res.status(403).json({ message: 'Only admins can change admins' });
    if (!membersOf(chat).includes(String(req.params.userId))) {
      return res.status(400).json({ message: 'That user is not in this group' });
    }

    const makeAdmin = req.body?.admin !== false;
    await Chat.updateOne(
      { _id: chat._id },
      makeAdmin
        ? { $addToSet: { admins: req.params.userId } }
        : { $pull: { admins: req.params.userId } }
    );

    const fresh = await findMembership(req.params.id, req.user.id);
    const payload = await serializeChat(fresh, req.user.id);
    emitToMembers(req.app.get('io'), fresh, 'chat:updated', payload);
    res.json(payload);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* -------------------------------- messages -------------------------------- */

router.get('/:id/messages', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid chat' });
    const chat = await findMembership(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const limit = clampNumber(req.query.limit, 1, 100, 30);
    const filter = { chat: chat._id };
    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (!Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
    } else if (req.query.page) {
      // Backwards compatibility with the original page/limit contract.
      const page = Math.max(1, Number(req.query.page) || 1);
      const skip = (page - 1) * limit;
      const pageItems = await Message.find(filter)
        .populate('sender', 'name username avatarUrl phone')
        .populate({ path: 'replyTo', select: 'content sender type media deletedAt' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      return res.json(pageItems.reverse());
    }

    const items = await Message.find(filter)
      .populate('sender', 'name username avatarUrl phone')
      .populate({ path: 'replyTo', select: 'content sender type media deletedAt' })
      .sort({ createdAt: -1 })
      .limit(limit + 1);

    const hasMore = items.length > limit;
    const sliced = items.slice(0, limit).reverse();
    res.json({ messages: sliced, hasMore, nextBefore: hasMore ? sliced[0]?.createdAt : null });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid chat' });
    const chat = await findMembership(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    const at = await markChatRead(req.app.get('io'), chat, req.user.id);
    res.json({ message: 'Chat marked as read', at });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
