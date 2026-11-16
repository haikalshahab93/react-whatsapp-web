const express = require('express');
const { Notification } = require('../models/Social');
const { isObjectId } = require('../utils/validation');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const filter = { user: req.user.id };
    if (req.query.unread === 'true') filter.readAt = null;
    const items = await Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    const unreadCount = await Notification.countDocuments({ user: req.user.id, readAt: null });
    res.json({ items, unreadCount });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ message: 'Notifications marked as read', updated: result.modifiedCount });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification' });
    await Notification.updateOne(
      { _id: req.params.id, user: req.user.id },
      { $set: { readAt: new Date() } }
    );
    res.json({ message: 'Notification read' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification' });
    await Notification.deleteOne({ _id: req.params.id, user: req.user.id });
    res.sendStatus(204);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
