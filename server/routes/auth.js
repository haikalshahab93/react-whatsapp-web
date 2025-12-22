const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Chat = require('../models/Chat');

const router = express.Router();

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('SMTP is not configured. Verification emails will not be sent.');
    return null;
  }
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function sendVerificationEmail(to, token) {
  const transport = createTransport();
  const origin = process.env.APP_ORIGIN || 'http://localhost:3001';
  const verifyUrl = `${origin}/verify?token=${token}`;
  const mail = {
    from: process.env.SMTP_FROM || 'noreply@chateasy.local',
    to,
    subject: 'ChatEasy - Verify your email',
    html: `<p>Hi, please verify your email to activate your ChatEasy account.</p><p><a href="${verifyUrl}">Verify Email</a></p>`,
  };
  if (!transport) return Promise.resolve();
  return transport.sendMail(mail);
}

function sendWhatsAppMessage(phone, text) {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g., '+14155238886'
  if (!sid || !token || !from) {
    console.warn('Twilio WhatsApp is not configured. OTP will not be sent.');
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

function generateOTP() {
  // 6-digit numeric
  return String(Math.floor(100000 + Math.random() * 900000));
}

// helper to escape regex special chars
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, inviter } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
    const emailNorm = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: emailNorm });
    if (existing) return res.status(409).json({ message: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
    const doc = { name, email: emailNorm, passwordHash, verificationToken: token, verificationTokenExpires: expires };
    if (typeof phone === 'string' && phone.trim().length > 0) {
      doc.phone = phone.trim();
    }
    if (typeof inviter === 'string' && inviter.trim().length > 0) {
      try { doc.invitedBy = inviter.trim(); } catch {}
    }
    const user = await User.create(doc);
    await sendVerificationEmail(emailNorm, token).catch(() => {});
    const includeToken = process.env.NODE_ENV !== 'production' || (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS);
    const response = includeToken
      ? { message: 'Registered. Check your email to verify.', userId: user._id, verificationToken: token }
      : { message: 'Registered. Check your email to verify.', userId: user._id };
    res.status(201).json(response);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Resend verification email
router.post('/resend', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Missing email' });
    const emailNorm = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: emailNorm });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.verified) return res.status(400).json({ message: 'Already verified' });
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);
    user.verificationToken = token;
    user.verificationTokenExpires = expires;
    await user.save();
    await sendVerificationEmail(emailNorm, token).catch(() => {});
    const includeToken = process.env.NODE_ENV !== 'production' || (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS);
    const response = includeToken
      ? { message: 'Verification email resent', verificationToken: token }
      : { message: 'Verification email resent' };
    res.json(response);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Verify email with token
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Missing token' });
    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).json({ message: 'Invalid token' });
    if (user.verificationTokenExpires && user.verificationTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Token expired' });
    }

    user.verified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    // Capture inviter before clearing
    const inviterId = user.invitedBy ? String(user.invitedBy) : '';
    let createdChat = null;
    if (inviterId) {
      const inviter = await User.findById(inviterId);
      if (inviter) {
        const existing = await Chat.findOne({ isGroup: false, members: { $all: [user._id, inviter._id] } });
        if (!existing) {
          createdChat = await Chat.create({
            name: `${inviter.name || 'User'} & ${user.name || 'User'}`,
            isGroup: false,
            members: [inviter._id, user._id],
          });
        }
      }
      user.invitedBy = undefined;
    }

    await user.save();

    // Emit event to inviter and the new user to refresh chat list
    const io = req.app.get('io');
    if (io && createdChat) {
      io.to(`user:${user._id}`).emit('chat:created', createdChat);
      if (createdChat.members && createdChat.members.length) {
        createdChat.members.forEach((uid) => {
          io.to(`user:${uid}`).emit('chat:created', createdChat);
        });
      }
    }

    res.json({ message: 'Email verified', user });
  } catch (e) {
    console.error('verify error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/otp/verify', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: 'Missing phone or otp' });
    const user = await User.findOne({ phone: String(phone).trim() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.otpExpires || user.otpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'OTP expired' });
    }
    const ok = user.otpHash && (await bcrypt.compare(otp, user.otpHash));
    if (!ok) return res.status(400).json({ message: 'Invalid OTP' });

    user.verified = true;
    user.otpHash = undefined;
    user.otpExpires = undefined;
    user.otpChannel = undefined;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    const inviterId = user.invitedBy ? String(user.invitedBy) : '';
    let createdChat = null;
    if (inviterId) {
      const inviter = await User.findById(inviterId);
      if (inviter) {
        const existing = await Chat.findOne({ isGroup: false, members: { $all: [user._id, inviter._id] } });
        if (!existing) {
          createdChat = await Chat.create({
            name: `${inviter.name || 'User'} & ${user.name || 'User'}`,
            isGroup: false,
            members: [inviter._id, user._id],
          });
        }
      }
      user.invitedBy = undefined;
    }

    await user.save();

    const io = req.app.get('io');
    if (io && createdChat) {
      if (createdChat.members && createdChat.members.length) {
        createdChat.members.forEach((uid) => {
          io.to(`user:${uid}`).emit('chat:created', createdChat);
        });
      }
    }

    res.json({ message: 'Phone verified', user });
  } catch (e) {
    console.error('otp verify error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing email or password' });
    const rawEmail = String(email).trim();
    const emailQuery = new RegExp(`^${escapeRegex(rawEmail)}$`, 'i');
    const user = await User.findOne({ email: emailQuery });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.verified) return res.status(403).json({ message: 'Please verify your email' });
    const token = jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, phone: user.phone || null } });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;