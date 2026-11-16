const express = require('express');
const User = require('../models/User');
const { Like, Match, FriendRequest, Block, pairKeyFor } = require('../models/Social');
const { rateLimit } = require('../middleware/rateLimit');
const { cleanStringArray, isObjectId, clampNumber } = require('../utils/validation');
const { haversineKm, coarsePoint, formatDistance } = require('../utils/geo');
const { isOnline } = require('../utils/presence');
const { notify } = require('../utils/notify');
const { visibleUserIds, areFriends } = require('../utils/social');

const router = express.Router();
const swipeLimiter = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'discovery' });
const DISTANCES = [1, 5, 10, 25, 50, 100];

function birthdateRange(minAge, maxAge) {
  const now = new Date();
  const upper = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate()); // youngest
  const lower = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate()); // oldest
  return { $gte: lower, $lte: upper };
}

/* ------------------------------- location -------------------------------- */

router.post('/location', async (req, res) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ message: 'Invalid coordinates' });
    }
    // Coarsened before storage: the exact browser coordinates are never persisted.
    const point = coarsePoint(lat, lng);
    await User.updateOne(
      { _id: req.user.id },
      { $set: { location: point, lastActiveAt: new Date() } }
    );
    res.json({ message: 'Location updated', coarsened: true, updatedAt: point.updatedAt });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/location', async (req, res) => {
  try {
    await User.updateOne({ _id: req.user.id }, { $unset: { location: 1 } });
    res.json({ message: 'Location removed' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* ------------------------------ preferences ------------------------------- */

router.get('/preferences', async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });
    res.json({
      discovery: me.discovery,
      discoverable: me.privacy?.discoverable !== false,
      hasLocation: !!me.location,
      locationUpdatedAt: me.location?.updatedAt || null,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.put('/preferences', async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });
    const body = req.body || {};
    if (typeof body.discoverable === 'boolean') me.privacy.discoverable = body.discoverable;
    const d = body.discovery || {};
    if (d.maxDistanceKm !== undefined && DISTANCES.includes(Number(d.maxDistanceKm))) {
      me.discovery.maxDistanceKm = Number(d.maxDistanceKm);
    }
    if (['male', 'female', 'all'].includes(d.genderPreference)) me.discovery.genderPreference = d.genderPreference;
    if (d.ageMin !== undefined) me.discovery.ageMin = clampNumber(d.ageMin, 18, 100, 18);
    if (d.ageMax !== undefined) me.discovery.ageMax = clampNumber(d.ageMax, 18, 100, 60);
    if (me.discovery.ageMin > me.discovery.ageMax) {
      return res.status(400).json({ message: 'Minimum age cannot be greater than maximum age' });
    }
    await me.save();
    res.json({ discovery: me.discovery, discoverable: me.privacy.discoverable !== false });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* -------------------------------- discovery ------------------------------- */

router.get('/', async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });

    const gender = ['male', 'female', 'all'].includes(req.query.gender)
      ? req.query.gender
      : me.discovery?.genderPreference || 'all';
    const minAge = clampNumber(req.query.minAge, 18, 100, me.discovery?.ageMin ?? 18);
    const maxAge = clampNumber(req.query.maxAge, 18, 100, me.discovery?.ageMax ?? 60);
    const maxDistanceKm = clampNumber(
      req.query.maxDistanceKm,
      1,
      100,
      me.discovery?.maxDistanceKm ?? 25
    );
    const interests = cleanStringArray(
      typeof req.query.interests === 'string' ? req.query.interests.split(',') : req.query.interests
    );
    const onlineOnly = req.query.onlineOnly === 'true' || req.query.onlineOnly === '1';
    const limit = clampNumber(req.query.limit, 1, 30, 12);
    const page = clampNumber(req.query.page, 0, 50, 0);

    const hidden = await visibleUserIds(req.user.id);

    // Do not show people already swiped, already friends, or with a pending request.
    const [likes, friendships, requests] = await Promise.all([
      Like.find({ from: req.user.id }).select('to').lean(),
      require('../models/Social').Friendship.find({ users: req.user.id }).select('users').lean(),
      FriendRequest.find({
        status: 'pending',
        $or: [{ from: req.user.id }, { to: req.user.id }],
      })
        .select('from to')
        .lean(),
    ]);

    const excluded = new Set([String(req.user.id), ...hidden]);
    likes.forEach((l) => excluded.add(String(l.to)));
    friendships.forEach((f) => f.users.forEach((u) => excluded.add(String(u))));
    requests.forEach((r) => {
      excluded.add(String(r.from));
      excluded.add(String(r.to));
    });

    const query = {
      _id: { $nin: [...excluded] },
      disabled: { $ne: true },
      'privacy.discoverable': { $ne: false },
      birthdate: birthdateRange(minAge, maxAge),
    };
    if (gender !== 'all') query.gender = gender;
    if (interests.length) query.interests = { $in: interests };

    // Hard cap keeps the free-tier query cheap; filtering happens in memory afterwards.
    const candidates = await User.find(query)
      .select(
        'name username avatarUrl coverUrl bio gender birthdate interests languages occupation online lastActiveAt statusMessage location privacy'
      )
      .sort({ lastActiveAt: -1, createdAt: -1 })
      .limit(300)
      .lean();

    const myPoint = me.location && me.location.lat != null ? me.location : null;

    let list = candidates.map((u) => {
      const distanceKm =
        myPoint && u.location && u.location.lat != null ? haversineKm(myPoint, u.location) : null;
      const showDistance = u.privacy?.showDistance !== false;
      return {
        _id: u._id,
        name: u.name,
        username: u.username || null,
        avatarUrl: u.avatarUrl || null,
        coverUrl: u.coverUrl || null,
        bio: u.bio || '',
        gender: u.gender || null,
        age: u.birthdate ? require('../models/User').calculateAge(u.birthdate) : null,
        interests: u.interests || [],
        languages: u.languages || [],
        occupation: u.occupation || null,
        statusMessage: u.statusMessage || '',
        isOnline: isOnline(u._id) || !!u.online,
        lastActiveAt: u.lastActiveAt || null,
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
        distanceLabel: showDistance ? formatDistance(distanceKm) : distanceKm === null ? null : 'Nearby',
        messagesFrom: u.privacy?.messagesFrom || 'friends',
      };
    });

    // Distance filter only applies to people we can actually locate.
    list = list.filter((u) => u.distanceKm === null || u.distanceKm <= maxDistanceKm);
    if (onlineOnly) list = list.filter((u) => u.isOnline);

    list.sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm !== null) return 1;
      if (b.distanceKm === null && a.distanceKm !== null) return -1;
      if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0);
    });

    // Who already liked me (used for the "likes you" hint on cards).
    const likesMe = await Like.find({ to: req.user.id, action: 'like' })
      .select('from')
      .lean();
    const likesMeSet = new Set(likesMe.map((l) => String(l.from)));

    const start = page * limit;
    const slice = list.slice(start, start + limit).map((u) => ({
      ...u,
      likedMe: likesMeSet.has(String(u._id)),
    }));

    res.json({
      results: slice,
      page,
      hasMore: start + limit < list.length,
      total: list.length,
      hasLocation: !!myPoint,
      filters: { gender, minAge, maxAge, maxDistanceKm, interests, onlineOnly },
    });
  } catch (e) {
    console.error('discovery error', e);
    res.status(400).json({ message: e.message });
  }
});

/* --------------------------------- swipes --------------------------------- */

router.post('/like', swipeLimiter, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!isObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    if (String(userId) === String(req.user.id)) return res.status(400).json({ message: 'Invalid user' });

    const target = await User.findById(userId);
    if (!target || target.disabled) return res.status(404).json({ message: 'User not found' });
    if (await Block.exists({ $or: [{ blocker: req.user.id, blocked: userId }, { blocker: userId, blocked: req.user.id }] })) {
      return res.status(403).json({ message: 'You cannot like this user' });
    }

    await Like.updateOne(
      { from: req.user.id, to: userId },
      { $set: { action: 'like' } },
      { upsert: true }
    );

    const mutual = await Like.exists({ from: userId, to: req.user.id, action: 'like' });
    if (!mutual) return res.json({ match: false });

    const pairKey = pairKeyFor(req.user.id, userId);
    await Match.updateOne(
      { pairKey },
      { $setOnInsert: { pairKey, users: [req.user.id, userId], createdAt: new Date() } },
      { upsert: true }
    );

    const me = await User.findById(req.user.id).select('name avatarUrl');
    const io = req.app.get('io');
    await Promise.all([
      notify(io, {
        user: userId,
        type: 'match',
        title: `You matched with ${me?.name || 'someone'}!`,
        body: 'You liked each other. Send a friend request to start chatting.',
        data: { userId: String(req.user.id) },
      }),
      notify(io, {
        user: req.user.id,
        type: 'match',
        title: `You matched with ${target.name}!`,
        body: 'You liked each other. Send a friend request to start chatting.',
        data: { userId: String(userId) },
      }),
    ]);
    io?.to(`user:${userId}`).emit('match:new', { user: { _id: String(req.user.id), name: me?.name, avatarUrl: me?.avatarUrl } });

    res.json({
      match: true,
      user: { ...target.toPublicProfile(false), isOnline: isOnline(target._id) },
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/skip', swipeLimiter, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!isObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    await Like.updateOne(
      { from: req.user.id, to: userId },
      { $set: { action: 'skip' } },
      { upsert: true }
    );
    res.json({ message: 'Skipped' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/swipe/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    await Like.deleteOne({ from: req.user.id, to: userId });
    res.json({ message: 'Swipe undone' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.get('/likes', async (req, res) => {
  try {
    const likes = await Like.find({ to: req.user.id, action: 'like' }).sort({ createdAt: -1 }).limit(50).lean();
    const ids = likes.map((l) => l.from);
    const users = await User.find({ _id: { $in: ids } }).select(
      'name username avatarUrl bio gender birthdate interests languages occupation online lastActiveAt privacy'
    );
    const hidden = await visibleUserIds(req.user.id);
    const friends = new Map();
    for (const u of users) {
      friends.set(String(u._id), await areFriends(req.user.id, u._id));
    }
    res.json(
      users
        .filter((u) => !hidden.has(String(u._id)))
        .map((u) => ({ ...u.toPublicProfile(friends.get(String(u._id))), isOnline: isOnline(u._id) }))
    );
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
