const { Friendship, Block, FriendRequest, pairKeyFor } = require('../models/Social');

async function areFriends(a, b) {
  if (!a || !b || String(a) === String(b)) return false;
  const doc = await Friendship.exists({ pairKey: pairKeyFor(a, b) });
  return !!doc;
}

async function friendIdsOf(userId) {
  const rows = await Friendship.find({ users: userId }).select('users').lean();
  const ids = [];
  for (const row of rows) {
    for (const id of row.users) {
      if (String(id) !== String(userId)) ids.push(String(id));
    }
  }
  return ids;
}

/** True when either side has blocked the other. */
async function blockedEitherWay(a, b) {
  if (!a || !b) return false;
  const doc = await Block.exists({
    $or: [
      { blocker: a, blocked: b },
      { blocker: b, blocked: a },
    ],
  });
  return !!doc;
}

async function blockedByMe(me, other) {
  return !!(await Block.exists({ blocker: me, blocked: other }));
}

async function pendingRequestBetween(a, b) {
  return FriendRequest.findOne({
    status: 'pending',
    $or: [
      { from: a, to: b },
      { from: b, to: a },
    ],
  }).lean();
}

async function visibleUserIds(meId) {
  const blocked = await Block.find({ $or: [{ blocker: meId }, { blocked: meId }] })
    .select('blocker blocked')
    .lean();
  const hidden = new Set();
  for (const row of blocked) {
    hidden.add(String(row.blocker));
    hidden.add(String(row.blocked));
  }
  return hidden;
}

module.exports = {
  areFriends,
  friendIdsOf,
  blockedEitherWay,
  blockedByMe,
  pendingRequestBetween,
  visibleUserIds,
};
