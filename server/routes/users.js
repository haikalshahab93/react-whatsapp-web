const express = require('express');
const User = require('../models/User');
const router = express.Router();
const nodemailer = require('nodemailer');

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

function sendInviteEmail(to, message) {
  const transport = createTransport();
  const origin = process.env.APP_ORIGIN || 'http://localhost:3001';
  const subject = 'Undangan bergabung ke ChatEasy';
  const html = `<p>Hai! Kamu diundang untuk bergabung ke ChatEasy.</p><p><a href="${origin}/register">Daftar di ChatEasy</a></p>${message ? `<p>Pesan: ${message}</p>` : ''}`;
  const mail = {
    from: process.env.SMTP_FROM || 'noreply@chateasy.local',
    to,
    subject,
    html,
  };
  if (!transport) return Promise.resolve();
  return transport.sendMail(mail);
}

function sendWhatsAppMessage(phone, text) {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g., '+14155238886'
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

// Create user (admin-only or internal) - keep basic
router.post('/', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// List users
router.get('/', async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).select('-passwordHash -verificationToken -verificationTokenExpires');
  res.json(users);
});

// Suggest users based on current user's email domain or phone prefix
router.get('/suggest', async (req, res) => {
  try {
    const { emailDomain, phonePrefix, q, limit = 50 } = req.query;
    const meId = req.user && req.user.id;
    const me = meId ? await User.findById(meId) : null;

    let domain = (typeof emailDomain === 'string' && emailDomain.trim()) || '';
    if (!domain && me && me.email) {
      const atIdx = String(me.email).indexOf('@');
      if (atIdx > -1) domain = String(me.email).slice(atIdx + 1);
    }

    let prefix = (typeof phonePrefix === 'string' && phonePrefix.trim()) || '';
    if (!prefix && me && me.phone) {
      const p = String(me.phone).trim();
      // naive: take first 4 chars for country code/prefix
      prefix = p.slice(0, Math.min(4, p.length));
    }

    const filters = [];
    if (domain) filters.push({ email: new RegExp(`@${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (prefix) filters.push({ phone: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') });

    let query = filters.length > 0 ? { $or: filters } : {};
    if (q && typeof q === 'string' && q.trim()) {
      const qq = q.trim();
      const escaped = qq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const like = new RegExp(escaped, 'i');
      query = {
        $and: [query],
        $or: [{ name: like }, { email: like }, { phone: like }],
      };
    }

    const users = await User.find(query)
      .select('name email phone avatarUrl createdAt')
      .limit(Number(limit) || 50)
      .sort({ createdAt: -1 });

    const list = users.filter((u) => meId ? String(u._id) !== String(meId) : true);
    res.json(list);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Send invitation via email or WhatsApp
router.post('/invite', async (req, res) => {
  try {
    const { email, phone, message } = req.body || {};
    if (!email && !phone) return res.status(400).json({ message: 'Masukkan email atau nomor WhatsApp' });

    const inviterId = req.user && req.user.id ? String(req.user.id) : '';
    const origin = process.env.APP_ORIGIN || 'http://localhost:3001';
    const registerUrl = inviterId ? `${origin}/register?inviter=${encodeURIComponent(inviterId)}` : `${origin}/register`;

    if (email) {
      const subjMsg = typeof message === 'string' ? message : '';
      const transport = createTransport();
      const mail = {
        from: process.env.SMTP_FROM || 'noreply@chateasy.local',
        to: String(email).trim(),
        subject: 'Undangan bergabung ke ChatEasy',
        html: `<p>Hai! Kamu diundang untuk bergabung ke ChatEasy.</p><p><a href="${registerUrl}">Daftar di ChatEasy</a></p>${subjMsg ? `<p>Pesan: ${subjMsg}</p>` : ''}`,
      };
      if (transport) await transport.sendMail(mail);
    }
    if (phone) {
      const text = `Kamu diundang bergabung ke ChatEasy. Daftar: ${registerUrl}${message ? `\nPesan: ${message}` : ''}`;
      await sendWhatsAppMessage(String(phone).trim(), text);
    }

    res.json({ message: 'Undangan dikirim' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Get by id
router.get('/:id', async (req, res) => {
  const user = await User.findById(req.params.id).select('-passwordHash -verificationToken -verificationTokenExpires');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-passwordHash -verificationToken -verificationTokenExpires');
    res.json(user);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

module.exports = router;