const express = require('express');
const User = require('../models/User');
const { FriendRequest, Friendship, Like, Match, Block, Report, pairKeyFor } = require('../models/Social');
const Chat = require('../models/Chat');
const { rateLimit } = require('../middleware/rateLimit');
const { cleanString, isObjectId } = require('../utils/validation');
const { areFriends, blockedEitherWay, visibleUserIds } = require('../utils/social');
const { notify } = require('../utils/notify');
const { isOnline } = require('../utils/presence');

const router = express.Router();
const requestLimiter = rateLimit({ windowMs: 60 * 60_000, max: 60, keyPrefix: 'friend-req' });

function publicCard(user) {
  return {
    ...user.toPublicProfile(false),
    isOnline: isOnline(user._id),
  };
}

async function ensureDirectChat(a, b, name) {
  const directKey = Chat.directKeyFor(a, b);
  return Chat.findOneAndUpdate(
    { directKey },
    {
      $setOnInsert: {
        directKey,
        name: name || 'Direct chat',
        isGroup: false,
        members: [a, b],
        createdBy: a,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

/* --------------------------------- friends -------------------------------- */

router.get('/', async (req, res) => {
  try {
    const rows = await Friendship.find({ users: req.user.id }).select('users createdAt').lean();
    const ids = [];
    for (const row of rows) {
      for (const id of row.users) {
        if (String(id) !== String(req.user.id)) ids.push(id);
      }
    }
    const users = await User.find({ _id: { $in: ids } }).select(
      'name username avatarUrl bio gender birthdate interests languages occupation online lastActiveAt statusMessage privacy createdAt'
    );
    res.json(users.map((u) => ({ ...u.toPublicProfile(true), isOnline: isOnline(u._id) })));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.get('/requests/received', async (req, res) => {
  try {
    const requests = await FriendRequest.find({ to: req.user.id, status: 'pending' })
      .sort({ updatedAt: -1 })
      .populate('from', 'name username avatarUrl bio gender birthdate online lastActiveAt statusMessage');
    res.json(
      requests
        .filter((r) => r.from)
        .map((r) => ({
          _id: r._id,
          message: r.message,
          createdAt: r.createdAt,
          from: publicCard(r.from),
        }))
    );
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.get('/requests/sent', async (req, res) => {
  try {
    const requests = await FriendRequest.find({ from: req.user.id, status: { $in: ['pending', 'rejected'] } })
      .sort({ updatedAt: -1 })
      .populate('to', 'name username avatarUrl bio gender birthdate online lastActiveAt statusMessage');
    res.json(
      requests
        .filter((r) => r.to)
        .map((r) => ({
          _id: r._id,
          status: r.status,
          message: r.message,
          createdAt: r.createdAt,
          to: publicCard(r.to),
        }))
    );
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/request', requestLimiter, async (req, res) => {
  try {
    const { toUserId } = req.body || {};
    const message = cleanString(req.body?.message, 300);
    if (!isObjectId(toUserId)) return res.status(400).json({ message: 'Invalid user' });
    if (String(toUserId) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot add yourself' });
    }

    const target = await User.findById(toUserId);
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.disabled) return res.status(400).json({ message: 'This account is unavailable' });
    if (await blockedEitherWay(req.user.id, target._id)) {
      return res.status(403).json({ message: 'You cannot send a request to this user' });
    }
    if (await areFriends(req.user.id, target._id)) {
      return res.status(409).json({ message: 'You are already friends' });
    }

    // If they already asked us, accept instead of creating a mirror request.
    const incoming = await FriendRequest.findOne({ from: target._id, to: req.user.id, status: 'pending' });
    if (incoming) {
      return res.status(409).json({ message: 'This user already sent you a request. Open your requests to accept.' });
    }

    const existingOutgoing = await FriendRequest.findOne({ from: req.user.id, to: target._id });
    if (existingOutgoing && existingOutgoing.status === 'pending') {
      return res.status(409).json({ message: 'Request already sent' });
    }

    const doc = await FriendRequest.findOneAndUpdate(
      { from: req.user.id, to: target._id },
      {
        $set: { status: 'pending', message, respondedAt: null },
        $setOnInsert: { from: req.user.id, to: target._id },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const me = await User.findById(req.user.id).select('name avatarUrl');
    await notify(req.app.get('io'), {
      user: target._id,
      type: 'friend_request',
      title: `${me?.name || 'Someone'} sent you a friend request`,
      body: message,
      data: { requestId: String(doc._id), userId: String(req.user.id) },
    });

    req.app.get('io')?.to(`user:${target._id}`).emit('friend:request', {
      requestId: String(doc._id),
      from: { _id: String(req.user.id), name: me?.name || 'Someone', avatarUrl: me?.avatarUrl || null },
    });

    res.status(201).json({ message: 'Friend request sent', request: doc });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/** Accept: guarded status transition makes duplicate accepts impossible. */
router.post('/request/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: 'Invalid request' });

    const request = await FriendRequest.findOneAndUpdate(
      { _id: id, to: req.user.id, status: 'pending' },
      { $set: { status: 'accepted', respondedAt: new Date() } },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: 'Request not found or already handled' });

    const pairKey = pairKeyFor(request.from, request.to);
    await Friendship.updateOne(
      { pairKey },
      { $setOnInsert: { pairKey, users: [request.from, request.to], createdAt: new Date() } },
      { upsert: true }
    );
    // Any mirrored pending request in the opposite direction is now obsolete.
    await FriendRequest.updateOne(
      { from: req.user.id, to: request.from, status: 'pending' },
      { $set: { status: 'cancelled', respondedAt: new Date() } }
    );

    const [me, other] = await Promise.all([
      User.findById(req.user.id).select('name avatarUrl'),
      User.findById(request.from).select('name avatarUrl'),
    ]);

    await ensureDirectChat(request.to, request.from, `${other?.name || 'User'} & ${me?.name || 'User'}`);

    const io = req.app.get('io');
    await notify(io, {
      user: request.from,
      type: 'friend_accepted',
      title: `${me?.name || 'Someone'} accepted your friend request`,
      body: 'You can now message each other privately.',
      data: { userId: String(req.user.id) },
    });
    io?.to(`user:${request.from}`).emit('friend:accepted', {
      user: { _id: String(req.user.id), name: me?.name || 'User', avatarUrl: me?.avatarUrl || null },
    });
    io?.to(`user:${req.user.id}`).emit('friend:accepted', {
      user: { _id: String(request.from), name: other?.name || 'User', avatarUrl: other?.avatarUrl || null },
    });

    res.json({ message: 'Friend request accepted' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/request/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: 'Invalid request' });
    const request = await FriendRequest.findOneAndUpdate(
      { _id: id, to: req.user.id, status: 'pending' },
      { $set: { status: 'rejected', respondedAt: new Date() } },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: 'Request not found or already handled' });
    res.json({ message: 'Friend request declined' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/request/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: 'Invalid request' });
    const request = await FriendRequest.findOneAndUpdate(
      { _id: id, from: req.user.id, status: 'pending' },
      { $set: { status: 'cancelled', respondedAt: new Date() } },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: 'Request not found' });
    res.json({ message: 'Request cancelled' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/friend/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    const result = await Friendship.deleteOne({ pairKey: pairKeyFor(req.user.id, userId) });
    if (!result.deletedCount) return res.status(404).json({ message: 'You are not friends' });
    res.json({ message: 'Friend removed' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* ------------------------------- status/matches --------------------------- */

router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    const [friend, blocked, blockedMe, incoming, outgoing, match] = await Promise.all([
      areFriends(req.user.id, userId),
      Block.exists({ blocker: req.user.id, blocked: userId }),
      Block.exists({ blocker: userId, blocked: req.user.id }),
      FriendRequest.findOne({ from: userId, to: req.user.id, status: 'pending' }).lean(),
      FriendRequest.findOne({ from: req.user.id, to: userId, status: 'pending' }).lean(),
      Match.findOne({ pairKey: pairKeyFor(req.user.id, userId) }).lean(),
    ]);
    res.json({
      isFriend: friend,
      blockedByMe: !!blocked,
      blockedMe: !!blockedMe,
      incomingRequestId: incoming ? String(incoming._id) : null,
      outgoingRequestId: outgoing ? String(outgoing._id) : null,
      isMatch: !!match,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.get('/matches', async (req, res) => {
  try {
    const matches = await Match.find({ users: req.user.id }).sort({ createdAt: -1 }).limit(50).lean();
    const otherIds = matches
      .flatMap((m) => m.users)
      .filter((id) => String(id) !== String(req.user.id));
    const users = await User.find({ _id: { $in: otherIds } }).select(
      'name username avatarUrl bio gender birthdate online lastActiveAt'
    );
    const map = new Map(users.map((u) => [String(u._id), u]));
    res.json(
      matches
        .map((m) => {
          const otherId = m.users.find((id) => String(id) !== String(req.user.id));
          const other = map.get(String(otherId));
          return other ? { _id: m._id, createdAt: m.createdAt, user: publicCard(other) } : null;
        })
        .filter(Boolean)
    );
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* ------------------------------ block / report ---------------------------- */

router.post('/block/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    if (String(userId) === String(req.user.id)) return res.status(400).json({ message: 'You cannot block yourself' });
    await Block.updateOne(
      { blocker: req.user.id, blocked: userId },
      { $setOnInsert: { blocker: req.user.id, blocked: userId } },
      { upsert: true }
    );
    // Blocking severs the friendship and any pending requests in both directions.
    await Friendship.deleteOne({ pairKey: pairKeyFor(req.user.id, userId) });
    await FriendRequest.deleteMany({
      $or: [
        { from: req.user.id, to: userId },
        { from: userId, to: req.user.id },
      ],
    });
    res.json({ message: 'User blocked' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/block/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    await Block.deleteOne({ blocker: req.user.id, blocked: userId });
    res.json({ message: 'User unblocked' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.get('/blocked', async (req, res) => {
  try {
    const rows = await Block.find({ blocker: req.user.id }).select('blocked createdAt').lean();
    const users = await User.find({ _id: { $in: rows.map((r) => r.blocked) } }).select(
      'name username avatarUrl bio gender birthdate online lastActiveAt'
    );
    res.json(users.map((u) => publicCard(u)));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/report', requestLimiter, async (req, res) => {
  try {
    const { userId } = req.body || {};
    const reason = ['spam', 'harassment', 'fake_profile', 'inappropriate', 'other'].includes(req.body?.reason)
      ? req.body.reason
      : 'other';
    const details = cleanString(req.body?.details, 1000);
    if (!isObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    if (String(userId) === String(req.user.id)) return res.status(400).json({ message: 'Invalid user' });
    if (await blockedEitherWay(req.user.id, userId)) {
      return res.status(403).json({ message: 'You cannot report this user' });
    }
    await Report.create({ reporter: req.user.id, reported: userId, reason, details });
    res.status(201).json({ message: 'Report submitted. Our team will review it.' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* ------------------------------- likes/matches ----------------------------- */

router.get('/likes/received', async (req, res) => {
  try {
    const likes = await Like.find({ to: req.user.id, action: 'like' }).sort({ createdAt: -1 }).limit(50).lean();
    const users = await User.find({ _id: { $in: likes.map((l) => l.from) } }).select(
      'name username avatarUrl bio gender birthdate online lastActiveAt'
    );
    const hidden = await visibleUserIds(req.user.id);
    res.json(users.filter((u) => !hidden.has(String(u._id))).map((u) => publicCard(u)));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
