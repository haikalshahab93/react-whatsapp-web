const express = require('express');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const router = express.Router();

// Create message
router.post('/', async (req, res) => {
  try {
    const msg = await Message.create(req.body);
    // Update chat lastMessage and emit realtime event
    try {
      const chatId = msg.chat;
      if (chatId) {
        await Chat.findByIdAndUpdate(chatId, { lastMessage: msg._id, updatedAt: new Date() });
        const io = req.app.get('io');
        if (io) {
          io.to(`chat:${chatId}`).emit('message:created', msg);
          // Notify members' chat list to update lastMessage ordering
          const chatDoc = await Chat.findById(chatId).populate('lastMessage').populate('members', 'name phone avatarUrl');
          if (chatDoc) {
            // Emit to each member's user room so LeftPanel can prepend/update ordering
            (chatDoc.members || []).forEach((m) => {
              io.to(`user:${m._id}`).emit('chat:updated', chatDoc);
            });
          }
        }
      }
    } catch (emitErr) {
      // Non-blocking: log but continue returning response
      console.warn('messages: emit message:created/chat:updated failed:', emitErr && emitErr.message);
    }
    res.status(201).json(msg);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Get message by id
router.get('/:id', async (req, res) => {
  const msg = await Message.findById(req.params.id).populate('sender', 'name phone avatarUrl');
  if (!msg) return res.status(404).json({ message: 'Message not found' });
  res.json(msg);
});

// Update message (e.g., mark forwarded or edit content)
router.put('/:id', async (req, res) => {
  try {
    const msg = await Message.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(msg);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Delete message
router.delete('/:id', async (req, res) => {
  await Message.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

module.exports = router;