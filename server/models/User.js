const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema(
  {
    // Stored as a coarse point (~1 km) so exact coordinates are never persisted.
    lng: { type: Number },
    lat: { type: Number },
    updatedAt: { type: Date },
  },
  { _id: false }
);

const PrivacySchema = new mongoose.Schema(
  {
    discoverable: { type: Boolean, default: true },
    showAge: { type: Boolean, default: true },
    showDistance: { type: Boolean, default: true },
    showOnline: { type: Boolean, default: true },
    messagesFrom: { type: String, enum: ['friends', 'everyone'], default: 'friends' },
  },
  { _id: false }
);

const DiscoverySchema = new mongoose.Schema(
  {
    maxDistanceKm: { type: Number, default: 25, min: 1, max: 100 },
    genderPreference: { type: String, enum: ['male', 'female', 'all'], default: 'all' },
    ageMin: { type: Number, default: 18, min: 18, max: 100 },
    ageMax: { type: Number, default: 60, min: 18, max: 100 },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    // ---- existing fields (unchanged) ----
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    phone: { type: String },
    avatarUrl: { type: String },
    statusMessage: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    otpHash: { type: String },
    otpExpires: { type: Date },
    otpChannel: { type: String },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ---- upgrade: password reset ----
    resetToken: { type: String },
    resetTokenExpires: { type: Date },

    // ---- upgrade: profile ----
    username: { type: String, lowercase: true, trim: true },
    coverUrl: { type: String },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    birthdate: { type: Date },
    bio: { type: String, default: '', maxlength: 500 },
    interests: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    occupation: { type: String, maxlength: 120 },

    // ---- upgrade: privacy / discovery / presence ----
    privacy: { type: PrivacySchema, default: () => ({}) },
    discovery: { type: DiscoverySchema, default: () => ({}) },
    location: { type: LocationSchema, default: undefined },
    online: { type: Boolean, default: false },
    lastActiveAt: { type: Date },

    // ---- upgrade: moderation ----
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Partial unique index: only index documents where phone is a non-empty string
UserSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $gt: '' } } }
);

// Sparse unique username: legacy users without a username are not indexed.
UserSchema.index(
  { username: 1 },
  { unique: true, sparse: true }
);

UserSchema.index({ lastActiveAt: -1 });

/** Safe payload for other users: never leaks email, phone, password or exact location. */
UserSchema.methods.toPublicProfile = function toPublicProfile(viewerIsFriend) {
  const age = this.birthdate ? calculateAge(this.birthdate) : null;
  const privacy = this.privacy || {};
  const showAge = privacy.showAge !== false || viewerIsFriend;
  return {
    _id: this._id,
    name: this.name,
    username: this.username || null,
    avatarUrl: this.avatarUrl || null,
    coverUrl: this.coverUrl || null,
    bio: this.bio || '',
    gender: this.gender || null,
    age: showAge ? age : null,
    interests: this.interests || [],
    languages: this.languages || [],
    occupation: this.occupation || null,
    statusMessage: this.statusMessage || '',
    online: privacy.showOnline === false && !viewerIsFriend ? false : !!this.online,
    lastActiveAt: this.lastActiveAt || null,
    discoverable: privacy.discoverable !== false,
    messagesFrom: privacy.messagesFrom || 'friends',
    createdAt: this.createdAt,
  };
};

/** Owner payload: everything except credentials. */
UserSchema.methods.toSelf = function toSelf() {
  const obj = this.toObject({ virtuals: false });
  delete obj.passwordHash;
  delete obj.verificationToken;
  delete obj.verificationTokenExpires;
  delete obj.otpHash;
  delete obj.otpExpires;
  delete obj.resetToken;
  delete obj.resetTokenExpires;
  obj.id = String(this._id);
  obj.age = this.birthdate ? calculateAge(this.birthdate) : null;
  return obj;
};

function calculateAge(birthdate) {
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

module.exports = mongoose.model('User', UserSchema);
module.exports.calculateAge = calculateAge;
