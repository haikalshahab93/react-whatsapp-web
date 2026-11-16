require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const mongoose = require('mongoose');

const usersRouter = require('./routes/users');
const chatsRouter = require('./routes/chats');
const messagesRouter = require('./routes/messages');
const authRouter = require('./routes/auth');
const friendsRouter = require('./routes/friends');
const discoveryRouter = require('./routes/discovery');
const notificationsRouter = require('./routes/notifications');
const uploadsRouter = require('./routes/uploads');
const { authMiddleware } = require('./middleware/auth');
const { attachSocket } = require('./socket');

const app = express();
// Media uploads travel as base64 JSON, so the parser limit is above the 12 MB file cap.
app.use(express.json({ limit: '18mb' }));

// Sensible security headers (no extra dependency).
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=(self)');
  next();
});

// Return JSON instead of HTML when JSON body parsing fails
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Payload too large' });
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
    const Chat = require('./models/Chat');
    const Message = require('./models/Message');
    const Social = require('./models/Social');

    // Drop a legacy non-sparse phone index when one exists (only if the collection does).
    const exists = await mongoose.connection.db.listCollections({ name: 'users' }).toArray();
    if (exists.length) {
      const indexes = await User.collection.indexes();
      const phoneIdx = indexes.find((idx) => idx.name === 'phone_1');
      if (phoneIdx && !phoneIdx.sparse && !phoneIdx.partialFilterExpression) {
        await User.collection.dropIndex('phone_1');
        console.log('Dropped non-sparse phone_1 index');
      }
    }

    // syncIndexes is idempotent and never drops collections or documents.
    await Promise.all([
      User.syncIndexes(),
      Chat.syncIndexes(),
      Message.syncIndexes(),
      ...['FriendRequest', 'Friendship', 'Like', 'Match', 'Block', 'Report', 'Notification', 'Media'].map((name) =>
        Social[name].syncIndexes()
      ),
    ]);
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
app.use('/api/friends', authMiddleware, friendsRouter);
app.use('/api/discovery', authMiddleware, discoveryRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/uploads', authMiddleware, uploadsRouter);
// Media files are served through an authenticated handler (chat membership is enforced there).
app.use('/api/media', uploadsRouter);

// Serve the production build when it exists (single-origin deployment, no extra config).
const buildDir = path.join(__dirname, '..', 'build');
if (fs.existsSync(path.join(buildDir, 'index.html'))) {
  app.use(express.static(buildDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api|uploads|socket\.io).*/, (req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

// Socket.IO setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
app.set('io', io);
attachSocket(io);

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
