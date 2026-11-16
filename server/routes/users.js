const express = require('express');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');
const {
  cleanString,
  cleanStringArray,
  isObjectId,
  parseDate,
  slugifyUsername,
  escapeRegex,
} = require('../utils/validation');
const { areFriends, blockedEitherWay, visibleUserIds } = require('../utils/social');

const inviteLimiter = rateLimit({ windowMs: 60 * 60_000, max: 30, keyPrefix: 'invite' });
const updateLimiter = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'profile' });

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('SMTP is not configured. Invitation emails will not be sent.');
    return null;
  }
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function sendWhatsAppMessage(phone, text) {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    console.warn('Twilio WhatsApp is not configured. Invitation message will not be sent.');
    return Promise.resolve();
  }
  let client;
  try {
    client = require('twilio')(sid, token);
  } catch (e) {
    console.warn('Twilio SDK not installed. Skipping WhatsApp send.');
    return Promise.resolve();
  }
  const fromId = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const toId = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
  return client.messages.create({ from: fromId, to: toId, body: text });
}

/* ---------------------------------- self ---------------------------------- */

router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.toSelf());
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

async function updateMe(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const body = req.body || {};

    // Whitelisted fields only — credentials and moderation flags can never be set here.
    if (typeof body.name === 'string') {
      const name = cleanString(body.name, 80);
      if (!name) return res.status(400).json({ message: 'Name cannot be empty' });
      user.name = name;
    }
    if (typeof body.username === 'string') {
      const username = slugifyUsername(body.username, '');
      if (username.length < 3) return res.status(400).json({ message: 'Username must be at least 3 characters' });
      const clash = await User.exists({ username, _id: { $ne: user._id } });
      if (clash) return res.status(409).json({ message: 'That username is taken' });
      user.username = username;
    }
    if (typeof body.bio === 'string') user.bio = cleanString(body.bio, 500);
    if (typeof body.occupation === 'string') user.occupation = cleanString(body.occupation, 120);
    if (typeof body.statusMessage === 'string') user.statusMessage = cleanString(body.statusMessage, 140);
    if (Array.isArray(body.interests)) user.interests = cleanStringArray(body.interests, { max: 12, maxLen: 30 });
    if (Array.isArray(body.languages)) user.languages = cleanStringArray(body.languages, { max: 8, maxLen: 30 });
    if (typeof body.avatarUrl === 'string') user.avatarUrl = cleanString(body.avatarUrl, 500) || undefined;
    if (typeof body.coverUrl === 'string') user.coverUrl = cleanString(body.coverUrl, 500) || undefined;
    if (typeof body.gender === 'string') {
      if (!['male', 'female', 'other', 'prefer_not_to_say'].includes(body.gender)) {
        return res.status(400).json({ message: 'Invalid gender value' });
      }
      user.gender = body.gender;
    }
    if (body.birthdate !== undefined) {
      const birthdate = parseDate(body.birthdate);
      if (!birthdate) return res.status(400).json({ message: 'Invalid date of birth' });
      const age = (Date.now() - birthdate.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18) return res.status(400).json({ message: 'You must be at least 18 years old' });
      if (age > 120) return res.status(400).json({ message: 'Invalid date of birth' });
      user.birthdate = birthdate;
    }

    if (body.privacy && typeof body.privacy === 'object') {
      const p = body.privacy;
      if (typeof p.discoverable === 'boolean') user.privacy.discoverable = p.discoverable;
      if (typeof p.showAge === 'boolean') user.privacy.showAge = p.showAge;
      if (typeof p.showDistance === 'boolean') user.privacy.showDistance = p.showDistance;
      if (typeof p.showOnline === 'boolean') user.privacy.showOnline = p.showOnline;
      if (p.messagesFrom === 'friends' || p.messagesFrom === 'everyone') user.privacy.messagesFrom = p.messagesFrom;
    }

    if (body.discovery && typeof body.discovery === 'object') {
      const d = body.discovery;
      if (d.maxDistanceKm !== undefined) {
        const v = Number(d.maxDistanceKm);
        if ([1, 5, 10, 25, 50, 100].includes(v)) user.discovery.maxDistanceKm = v;
      }
      if (d.genderPreference === 'male' || d.genderPreference === 'female' || d.genderPreference === 'all') {
        user.discovery.genderPreference = d.genderPreference;
      }
      if (d.ageMin !== undefined) user.discovery.ageMin = Math.min(100, Math.max(18, Number(d.ageMin) || 18));
      if (d.ageMax !== undefined) user.discovery.ageMax = Math.min(100, Math.max(18, Number(d.ageMax) || 60));
      if (user.discovery.ageMin > user.discovery.ageMax) {
        return res.status(400).json({ message: 'Minimum age cannot be greater than maximum age' });
      }
    }

    user.lastActiveAt = new Date();
    await user.save();
    res.json(user.toSelf());
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

router.put('/me', updateLimiter, updateMe);

/* ------------------------------ discovery APIs ----------------------------- */

// List users (kept for compatibility, now privacy-safe and block-aware)
router.get('/', async (req, res) => {
  try {
    const hidden = await visibleUserIds(req.user.id);
    const users = await User.find({ _id: { $nin: [...hidden, req.user.id] } })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('name username avatarUrl bio gender birthdate interests languages occupation online lastActiveAt statusMessage privacy createdAt');
    res.json(users.map((u) => u.toPublicProfile(false)));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Suggest users to message/invite — excludes self and blocked users
router.get('/suggest', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const meId = req.user.id;
    const me = await User.findById(meId);
    if (!me) return res.status(404).json({ message: 'User not found' });

    const hidden = await visibleUserIds(meId);
    const filters = [{ _id: { $nin: [...hidden, meId] } }];

    if (q && typeof q === 'string' && q.trim()) {
      const like = new RegExp(escapeRegex(q.trim()), 'i');
      filters.push({ $or: [{ name: like }, { username: like }, { email: like }, { phone: like }] });
    } else {
      // Preserve the original "same email domain / phone prefix" suggestion behaviour.
      const domain = me.email && me.email.includes('@') ? me.email.split('@')[1] : '';
      const prefix = me.phone ? String(me.phone).slice(0, 4) : '';
      const or = [];
      if (domain) or.push({ email: new RegExp(`@${escapeRegex(domain)}$`, 'i') });
      if (prefix) or.push({ phone: new RegExp(`^${escapeRegex(prefix)}`) });
      if (or.length) filters.push({ $or: or });
    }

    const users = await User.find({ $and: filters })
      .select('name username email phone avatarUrl bio gender birthdate online lastActiveAt privacy createdAt')
      .limit(Math.min(Number(limit) || 20, 50))
      .sort({ lastActiveAt: -1 });

    res.json(
      users.map((u) => {
        const pub = u.toPublicProfile(false);
        // Only expose contact channels to the owner of those channels' network via invites.
        return { ...pub, email: u.email, phone: u.phone || null };
      })
    );
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Send invitation via email or WhatsApp
router.post('/invite', inviteLimiter, async (req, res) => {
  try {
    const { email, phone, message } = req.body || {};
    if (!email && !phone) return res.status(400).json({ message: 'Masukkan email atau nomor WhatsApp' });

    const inviterId = String(req.user.id);
    const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
    const registerUrl = `${origin}/register?inviter=${encodeURIComponent(inviterId)}`;
    const note = cleanString(message, 300);
    const results = { email: false, whatsapp: false };

    if (email) {
      const transport = createTransport();
      if (transport) {
        await transport.sendMail({
          from: process.env.SMTP_FROM || 'noreply@chateasy.local',
          to: cleanString(email, 254),
          subject: 'Undangan bergabung ke ChatEasy',
          html: `<p>Hai! Kamu diundang untuk bergabung ke ChatEasy.</p><p><a href="${registerUrl}">Daftar di ChatEasy</a></p>${note ? `<p>Pesan: ${note}</p>` : ''}`,
        });
        results.email = true;
      }
    }
    if (phone) {
      const configured = !!(process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
      if (configured) {
        await sendWhatsAppMessage(
          cleanString(phone, 32),
          `Kamu diundang bergabung ke ChatEasy. Daftar: ${registerUrl}${note ? `\nPesan: ${note}` : ''}`
        );
        results.whatsapp = true;
      }
    }

    const nothingSent = !results.email && !results.whatsapp;
    res.json({
      message: nothingSent
        ? 'Invitation channel is not configured on this server. Share your invite link instead.'
        : 'Undangan dikirim',
      registerUrl,
      delivered: results,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/* -------------------------------- by id ---------------------------------- */

router.get('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user id' });
    if (String(req.params.id) === String(req.user.id)) {
      const me = await User.findById(req.user.id);
      return res.json({ ...me.toSelf(), self: true });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (await blockedEitherWay(req.user.id, user._id)) {
      return res.status(404).json({ message: 'User not found' });
    }
    const friend = await areFriends(req.user.id, user._id);
    res.json({ ...user.toPublicProfile(friend), self: false, isFriend: friend });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Update self only (was previously open to any authenticated caller).
router.put('/:id', updateLimiter, async (req, res) => {
  if (String(req.params.id) !== String(req.user.id)) {
    return res.status(403).json({ message: 'You can only modify your own account' });
  }
  return updateMe(req, res);
});

// Delete own account only.
router.delete('/:id', async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user id' });
  if (String(req.params.id) !== String(req.user.id)) {
    return res.status(403).json({ message: 'You can only delete your own account' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.sendStatus(204);
  user.disabled = true;
  user.email = `deleted+${user._id}@chateasy.local`;
  user.username = `deleted_${String(user._id).slice(-8)}`;
  user.verified = false;
  await user.save();
  res.sendStatus(204);
});

module.exports = router;
