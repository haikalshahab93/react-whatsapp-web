const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Email-based account
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    // Secure password storage
    passwordHash: { type: String, required: true },
    // Optional phone field (unique only when non-empty via partial index)
    phone: { type: String },
    avatarUrl: { type: String },
    statusMessage: { type: String, default: '' },
    // Email verification
    verified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    // WhatsApp OTP verification
    otpHash: { type: String },
    otpExpires: { type: Date },
    otpChannel: { type: String }, // e.g., 'wa'
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Partial unique index: only index documents where phone is a non-empty string
UserSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $gt: '' } } }
);

module.exports = mongoose.model('User', UserSchema);