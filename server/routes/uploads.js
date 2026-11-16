const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Chat = require('../models/Chat');
const { Media } = require('../models/Social');
const { verifyToken } = require('../middleware/auth');
const { isObjectId, cleanString } = require('../utils/validation');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

const ALLOWED = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'],
  file: [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ],
};

const EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

function ensureDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** Upload accepts a base64 data URL — no multipart parser dependency needed. */
router.post('/', async (req, res) => {
  try {
    const { dataUrl, name, kind, chatId, duration, width, height } = req.body || {};
    const mediaKind = ['image', 'video', 'audio', 'file'].includes(kind) ? kind : 'file';
    if (typeof dataUrl !== 'string') return res.status(400).json({ message: 'Missing file data' });

    const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    if (!match) return res.status(400).json({ message: 'Unsupported file payload' });
    const mime = match[1].toLowerCase();
    if (!ALLOWED[mediaKind]?.includes(mime)) {
      return res.status(400).json({ message: `File type ${mime} is not allowed for ${mediaKind}` });
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return res.status(400).json({ message: 'Empty file' });
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ message: 'File is larger than the 12 MB limit' });
    }

    let scope = 'public';
    let chat = null;
    if (chatId) {
      if (!isObjectId(chatId)) return res.status(400).json({ message: 'Invalid chat' });
      const memberChat = await Chat.findOne({ _id: chatId, members: req.user.id }).select('_id');
      if (!memberChat) return res.status(403).json({ message: 'You are not a member of this chat' });
      scope = 'chat';
      chat = memberChat._id;
    }

    ensureDir();
    const filename = `${crypto.randomUUID()}${EXT[mime] || ''}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

    const doc = await Media.create({
      owner: req.user.id,
      chat,
      scope,
      kind: mediaKind,
      filename,
      originalName: cleanString(name, 200) || filename,
      mime,
      size: buffer.length,
    });

    res.status(201).json({
      _id: doc._id,
      url: `/api/media/${doc._id}`,
      name: doc.originalName,
      mime,
      size: buffer.length,
      kind: mediaKind,
      duration: Number(duration) || undefined,
      width: Number(width) || undefined,
      height: Number(height) || undefined,
      scope,
    });
  } catch (e) {
    console.error('upload error', e);
    res.status(400).json({ message: e.message });
  }
});

/**
 * Media is never served as public static files. Chat-scoped media requires membership;
 * `?token=` is accepted because <img>/<video> tags cannot send an Authorization header.
 */
router.get('/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : req.query.token;
    if (!token) return res.status(401).json({ message: 'Missing token' });

    let userId;
    try {
      userId = verifyToken(String(token)).id;
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid media' });
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ message: 'Not found' });

    if (media.scope === 'chat' && media.chat) {
      const allowed = await Chat.exists({ _id: media.chat, members: userId });
      if (!allowed) return res.status(403).json({ message: 'Not authorized to view this file' });
    }

    const filePath = path.join(UPLOAD_DIR, media.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File missing' });

    res.set('Content-Type', media.mime || 'application/octet-stream');
    res.set('Cache-Control', media.scope === 'chat' ? 'private, max-age=3600' : 'private, max-age=86400');
    res.set('Content-Disposition', `inline; filename="${(media.originalName || media.filename).replace(/"/g, '')}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
