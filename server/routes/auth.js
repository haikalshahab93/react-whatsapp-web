const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { authMiddleware, signToken } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const {
  cleanString,
  cleanStringArray,
  isEmail,
  parseDate,
  slugifyUsername,
} = require('../utils/validation');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 10 * 60_000, max: 40, keyPrefix: 'auth' });

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('SMTP is not configured. Emails will not be sent.');
    return null;
  }
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function appOrigin() {
  return process.env.APP_ORIGIN || 'http://localhost:3000';
}

function emailShell(title, paragraphs) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#12211c">
    <h2 style="margin:0 0 12px">${title}</h2>
    ${paragraphs.join('')}
    <p style="color:#6b7f78;font-size:12px;margin-top:28px">ChatEasy — private messaging &amp; nearby friends.</p>
  </div>`;
}

function sendVerificationEmail(to, token) {
  const transport = createTransport();
  const verifyUrl = `${appOrigin()}/verify?token=${token}`;
  const mail = {
    from: process.env.SMTP_FROM || 'noreply@chateasy.local',
    to,
    subject: 'ChatEasy - Verify your email',
    html: emailShell('Verify your email', [
      `<p>Welcome to ChatEasy. Confirm your email address to activate your account.</p>`,
      `<p><a href="${verifyUrl}" style="display:inline-block;background:#0f9d76;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Verify email</a></p>`,
      `<p style="color:#6b7f78;font-size:12px">Or paste this link: ${verifyUrl}</p>`,
    ]),
  };
  if (!transport) return Promise.resolve();
  return transport.sendMail(mail);
}

function sendResetEmail(to, token) {
  const transport = createTransport();
  const resetUrl = `${appOrigin()}/reset-password?token=${token}`;
  const mail = {
    from: process.env.SMTP_FROM || 'noreply@chateasy.local',
    to,
    subject: 'ChatEasy - Reset your password',
    html: emailShell('Reset your password', [
      `<p>We received a request to reset your ChatEasy password. This link expires in 60 minutes.</p>`,
      `<p><a href="${resetUrl}" style="display:inline-block;background:#0f9d76;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Choose a new password</a></p>`,
      `<p style="color:#6b7f78;font-size:12px">If you did not request this, you can ignore this email.</p>`,
    ]),
  };
  if (!transport) return Promise.resolve();
  return transport.sendMail(mail);
}

function sendWhatsAppMessage(phone, text) {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
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
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** True when the API can hand the verification token back to the client (no SMTP). */
function canExposeToken() {
  return !smtpConfigured();
}

async function uniqueUsername(name) {
  const base = slugifyUsername(name);
  for (let i = 0; i < 25; i += 1) {
    const candidate = i === 0 ? base : `${base}${i}`;
    const taken = await User.exists({ username: candidate });
    if (!taken) return candidate;
  }
  return `${base}${Date.now().toString().slice(-5)}`;
}

/** Shared by email verification and OTP verification (existing behaviour, preserved). */
async function completeVerification(user, io) {
  user.verified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpires = undefined;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpChannel = undefined;

  const inviterId = user.invitedBy ? String(user.invitedBy) : '';
  let createdChat = null;
  if (inviterId) {
    const inviter = await User.findById(inviterId);
    if (inviter) {
      const existing = await Chat.findOne({
        isGroup: false,
        members: { $all: [user._id, inviter._id] },
      });
      if (!existing) {
        createdChat = await Chat.create({
          name: `${inviter.name || 'User'} & ${user.name || 'User'}`,
          isGroup: false,
          members: [inviter._id, user._id],
          directKey: Chat.directKeyFor(inviter._id, user._id),
          createdBy: inviter._id,
        });
      }
    }
    user.invitedBy = undefined;
  }

  await user.save();

  if (io && createdChat) {
    for (const uid of createdChat.members || []) {
      io.to(`user:${uid}`).emit('chat:created', createdChat);
    }
  }
  return createdChat;
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const rawName = cleanString(req.body?.name, 80);
    const rawEmail = cleanString(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const { phone, inviter } = req.body || {};

    if (!rawName || !rawEmail || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (!isEmail(rawEmail)) return res.status(400).json({ message: 'Enter a valid email address' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const existing = await User.findOne({ email: rawEmail });
    if (existing) return res.status(409).json({ message: 'This email is already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);

    const birthdate = parseDate(req.body?.birthdate);
    const gender = ['male', 'female', 'other', 'prefer_not_to_say'].includes(req.body?.gender)
      ? req.body.gender
      : undefined;

    const doc = {
      name: rawName,
      email: rawEmail,
      passwordHash,
      verificationToken: token,
      verificationTokenExpires: expires,
      username: await uniqueUsername(rawName),
      bio: cleanString(req.body?.bio, 300),
      interests: cleanStringArray(req.body?.interests),
      ...(birthdate ? { birthdate } : {}),
      ...(gender ? { gender } : {}),
    };

    if (typeof phone === 'string' && phone.trim().length > 0) doc.phone = cleanString(phone, 32);
    if (typeof inviter === 'string' && inviter.trim().length > 0) {
      try {
        doc.invitedBy = inviter.trim();
      } catch {}
    }

    const user = await User.create(doc);
    await sendVerificationEmail(rawEmail, token).catch(() => {});

    const response = { message: 'Registered. Check your email to verify.', userId: user._id };
    if (canExposeToken()) response.verificationToken = token;
    res.status(201).json(response);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Resend verification email
router.post('/resend', authLimiter, async (req, res) => {
  try {
    const email = cleanString(req.body?.email, 254).toLowerCase();
    if (!email) return res.status(400).json({ message: 'Missing email' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.verified) return res.status(400).json({ message: 'Already verified' });
    const token = crypto.randomBytes(32).toString('hex');
    user.verificationToken = token;
    user.verificationTokenExpires = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await user.save();
    await sendVerificationEmail(email, token).catch(() => {});
    const response = { message: 'Verification email resent' };
    if (canExposeToken()) response.verificationToken = token;
    res.json(response);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Verify email with token
router.post('/verify', authLimiter, async (req, res) => {
  try {
    const token = cleanString(req.body?.token, 200);
    if (!token) return res.status(400).json({ message: 'Missing token' });
    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).json({ message: 'Invalid or already used token' });
    if (user.verificationTokenExpires && user.verificationTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Token expired' });
    }

    await completeVerification(user, req.app.get('io'));
    res.json({ message: 'Email verified', user: user.toSelf() });
  } catch (e) {
    console.error('verify error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/otp/request', authLimiter, async (req, res) => {
  try {
    const phone = cleanString(req.body?.phone, 32);
    if (!phone) return res.status(400).json({ message: 'Missing phone' });
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.verified) return res.status(400).json({ message: 'Already verified' });
    const otp = generateOTP();
    user.otpHash = await bcrypt.hash(otp, 10);
    user.otpExpires = new Date(Date.now() + 1000 * 60 * 10);
    user.otpChannel = 'wa';
    await user.save();
    const configured = !!(process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
    await sendWhatsAppMessage(phone, `Kode verifikasi ChatEasy: ${otp}`).catch(() => {});
    res.json(
      configured
        ? { message: 'OTP sent via WhatsApp' }
        : { message: 'WhatsApp is not configured on this server, so the code is shown here.', otp }
    );
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/otp/verify', authLimiter, async (req, res) => {
  try {
    const phone = cleanString(req.body?.phone, 32);
    const otp = cleanString(req.body?.otp, 10);
    if (!phone || !otp) return res.status(400).json({ message: 'Missing phone or otp' });
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.otpExpires || user.otpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'OTP expired' });
    }
    const ok = user.otpHash && (await bcrypt.compare(otp, user.otpHash));
    if (!ok) return res.status(400).json({ message: 'Invalid OTP' });

    await completeVerification(user, req.app.get('io'));
    res.json({ message: 'Phone verified', user: user.toSelf() });
  } catch (e) {
    console.error('otp verify error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = cleanString(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ message: 'Missing email or password' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.disabled) return res.status(403).json({ message: 'This account has been disabled' });
    if (!user.verified) {
      return res.status(403).json({ message: 'Please verify your email before signing in', code: 'unverified' });
    }

    user.lastActiveAt = new Date();
    await user.save();

    res.json({ token: signToken(user), user: user.toSelf() });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/forgot', authLimiter, async (req, res) => {
  try {
    const email = cleanString(req.body?.email, 254).toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    const user = await User.findOne({ email });

    // Always answer the same way so the endpoint cannot be used to probe accounts.
    const response = { message: 'If that email is registered, a reset link is on its way.' };
    if (!user) return res.json(response);

    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetTokenExpires = new Date(Date.now() + 1000 * 60 * 60);
    await user.save();
    await sendResetEmail(email, token).catch(() => {});
    if (canExposeToken()) response.resetToken = token;
    res.json(response);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.post('/reset', authLimiter, async (req, res) => {
  try {
    const token = cleanString(req.body?.token, 200);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!token) return res.status(400).json({ message: 'Missing token' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const user = await User.findOne({ resetToken: token });
    if (!user) return res.status(400).json({ message: 'Invalid or already used reset link' });
    if (!user.resetTokenExpires || user.resetTokenExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Reset link expired' });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    // A password reset also proves email ownership.
    user.verified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    res.json({ message: 'Password updated. You can sign in now.' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/** Current session user — the frontend uses this to hydrate auth state on load. */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'Session no longer valid' });
    if (user.disabled) return res.status(403).json({ message: 'This account has been disabled' });
    res.json(user.toSelf());
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
