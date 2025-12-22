const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const router = express.Router();

// Create chat (group or direct)
router.post('/', async (req, res) => {
  try {
    const chat = await Chat.create(req.body);
    res.status(201).json(chat);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// List chats (optionally filter by member)
router.get('/', async (req, res) => {
  const { member } = req.query;
  const filter = member ? { members: member } : {};
  const chats = await Chat.find(filter)
    .populate('lastMessage')
    .populate('members', 'name phone avatarUrl')
    .sort({ updatedAt: -1 });
  res.json(chats);
});

// Get chat by id
router.get('/:id', async (req, res) => {
  const chat = await Chat.findById(req.params.id)
    .populate('lastMessage')
    .populate('members', 'name phone avatarUrl');
  if (!chat) return res.status(404).json({ message: 'Chat not found' });
  res.json(chat);
});

// Update chat
router.put('/:id', async (req, res) => {
  try {
    const chat = await Chat.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(chat);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Delete chat
router.delete('/:id', async (req, res) => {
  await Chat.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

// List messages in a chat (pagination)
router.get('/:id/messages', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const messages = await Message.find({ chat: req.params.id })
    .populate('sender', 'name phone avatarUrl')
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));
  res.json(messages.reverse());
});

module.exports = router;