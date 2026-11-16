const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema(
  {
    // ---- existing fields (unchanged) ----
    name: { type: String, required: true },
    isGroup: { type: Boolean, default: false },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    pinned: { type: Boolean, default: false },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },

    // ---- upgrade: group management / read state ----
    // directKey prevents duplicate 1:1 chats ("<lowerId>:<higherId>").
    directKey: { type: String },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    avatarUrl: { type: String },
    description: { type: String, default: '', maxlength: 500 },
    reads: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        lastReadAt: { type: Date },
      },
    ],
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    leftBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// Sparse unique so legacy chats without directKey never collide.
ChatSchema.index({ directKey: 1 }, { unique: true, sparse: true });
ChatSchema.index({ members: 1, updatedAt: -1 });

ChatSchema.statics.directKeyFor = function directKeyFor(a, b) {
  return [String(a), String(b)].sort().join(':');
};

module.exports = mongoose.model('Chat', ChatSchema);
