const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema(
  {
    url: { type: String },
    name: { type: String },
    mime: { type: String },
    size: { type: Number },
    duration: { type: Number },
    width: { type: Number },
    height: { type: Number },
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    // ---- existing fields (unchanged) ----
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '', maxlength: 5000 },
    type: { type: String, enum: ['text', 'image', 'file', 'audio', 'video', 'sticker'], default: 'text' },
    forwarded: { type: Boolean, default: false },
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // ---- upgrade ----
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    reactions: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String },
      },
    ],
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    media: { type: MediaSchema, default: undefined },
    forwardedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

MessageSchema.index({ chat: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
