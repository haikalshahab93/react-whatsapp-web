const mongoose = require('mongoose');

/** Sorted pair key so {A,B} and {B,A} can never both exist. */
function pairKeyFor(a, b) {
  return [String(a), String(b)].sort().join(':');
}

/* ------------------------------- FriendRequest ------------------------------ */
const FriendRequestSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending' },
    message: { type: String, maxlength: 300, default: '' },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);
// One request document per direction; re-requesting reuses it.
FriendRequestSchema.index({ from: 1, to: 1 }, { unique: true });
FriendRequestSchema.index({ to: 1, status: 1, updatedAt: -1 });
FriendRequestSchema.index({ from: 1, status: 1, updatedAt: -1 });

/* -------------------------------- Friendship -------------------------------- */
const FriendshipSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true, unique: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
FriendshipSchema.index({ users: 1 });

/* ----------------------------------- Like ----------------------------------- */
const LikeSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['like', 'skip'], default: 'like' },
  },
  { timestamps: true }
);
LikeSchema.index({ from: 1, to: 1 }, { unique: true });
LikeSchema.index({ to: 1, action: 1 });

/* ---------------------------------- Match ----------------------------------- */
const MatchSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true, unique: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
MatchSchema.index({ users: 1 });

/* ---------------------------------- Block ----------------------------------- */
const BlockSchema = new mongoose.Schema(
  {
    blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
BlockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

/* ---------------------------------- Report ---------------------------------- */
const ReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reported: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      enum: ['spam', 'harassment', 'fake_profile', 'inappropriate', 'other'],
      default: 'other',
    },
    details: { type: String, maxlength: 1000, default: '' },
    status: { type: String, enum: ['open', 'reviewed', 'dismissed'], default: 'open' },
  },
  { timestamps: true }
);
ReportSchema.index({ reported: 1, createdAt: -1 });

/* ------------------------------- Notification ------------------------------- */
const NotificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['friend_request', 'friend_accepted', 'match', 'group_added', 'message', 'call', 'system'],
      default: 'system',
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date },
  },
  { timestamps: true }
);
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, readAt: 1 });

/* ----------------------------------- Media ---------------------------------- */
const MediaSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // When set, only members of that chat may fetch the file.
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
    // Public assets (avatars / covers) are readable by any signed-in user.
    scope: { type: String, enum: ['public', 'chat'], default: 'public' },
    kind: { type: String, enum: ['image', 'video', 'audio', 'file'], default: 'file' },
    filename: { type: String },
    originalName: { type: String },
    mime: { type: String },
    size: { type: Number },
  },
  { timestamps: true }
);

module.exports = {
  FriendRequest: mongoose.model('FriendRequest', FriendRequestSchema),
  Friendship: mongoose.model('Friendship', FriendshipSchema),
  Like: mongoose.model('Like', LikeSchema),
  Match: mongoose.model('Match', MatchSchema),
  Block: mongoose.model('Block', BlockSchema),
  Report: mongoose.model('Report', ReportSchema),
  Notification: mongoose.model('Notification', NotificationSchema),
  Media: mongoose.model('Media', MediaSchema),
  pairKeyFor,
};
