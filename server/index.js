require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connectDB = require('./config/db');
const mongoose = require('mongoose');

const usersRouter = require('./routes/users');
const chatsRouter = require('./routes/chats');
const messagesRouter = require('./routes/messages');
const authRouter = require('./routes/auth');
const { authMiddleware } = require('./middleware/auth');

const app = express();
app.use(express.json());

// Return JSON instead of HTML when JSON body parsing fails
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }
  next(err);
});

// Basic CORS (no extra dependency)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
  const dbStatus = state === 1 ? 'connected' : state === 2 ? 'connecting' : state === 3 ? 'disconnecting' : 'disconnected';
  res.json({ status: 'ok', db: dbStatus, timestamp: Date.now() });
});

// Database connection
connectDB().catch((err) => {
  console.error('MongoDB connection error:', err.message);
});

// Ensure indexes are in sync with schema (fix unique+sparse phone index)
mongoose.connection.once('open', async () => {
  try {
    const User = require('./models/User');
    // Drop non-sparse phone index if present, then sync schema indexes
    const indexes = await User.collection.indexes();
    const phoneIdx = indexes.find((idx) => idx.name === 'phone_1');
    if (phoneIdx && !phoneIdx.sparse) {
      await User.collection.dropIndex('phone_1');
      console.log('Dropped non-sparse phone_1 index');
    }
    await User.syncIndexes();
    console.log('Mongoose indexes synchronized');
  } catch (e) {
    console.warn('Index synchronization failed:', e && e.message);
  }
});

// Public auth routes
app.use('/api/auth', authRouter);

// Protected API routes
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/chats', authMiddleware, chatsRouter);
app.use('/api/messages', authMiddleware, messagesRouter);

// Socket.IO setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Attach io to app for emitting from routes
app.set('io', io);

const Message = require('./models/Message');
const Chat = require('./models/Chat');

io.on('connection', (socket) => {
  // Allow clients to join a per-user room
  socket.on('user:join', (userId) => {
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });

  // Join a chat room by chatId
  socket.on('chat:join', (chatId) => {
    socket.join(`chat:${chatId}`);
  });

  // Create a new message and broadcast to the room
  socket.on('message:new', async ({ chatId, senderId, content, type = 'text' }) => {
    try {
      const msg = await Message.create({ chat: chatId, sender: senderId, content, type });
      await Chat.findByIdAndUpdate(chatId, { lastMessage: msg._id, updatedAt: new Date() });
      io.to(`chat:${chatId}`).emit('message:created', msg);
    } catch (e) {
      console.error('socket message:new error', e);
      socket.emit('error', { message: 'Failed to create message' });
    }
  });

  // Typing indicator
  socket.on('typing', ({ chatId, userId, typing }) => {
    socket.to(`chat:${chatId}`).emit('typing', { userId, typing });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Generic error handler to always return JSON
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Server error' });
});