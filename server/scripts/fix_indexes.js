require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  try {
    await connectDB();
    await new Promise((resolve) => mongoose.connection.once('open', resolve));
    console.log('Connected to MongoDB');

    const indexes = await User.collection.indexes();
    console.log('Current indexes:', indexes.map(i => i.name));

    const phoneIdx = indexes.find((idx) => idx.name === 'phone_1');
    if (phoneIdx) {
      console.log('Dropping existing phone_1 index...');
      try {
        await User.collection.dropIndex('phone_1');
        console.log('Dropped phone_1 index');
      } catch (e) {
        console.warn('Drop index failed:', e.message);
      }
    } else {
      console.log('phone_1 index not found, nothing to drop');
    }

    await User.syncIndexes();
    const after = await User.collection.indexes();
    console.log('Indexes after sync:', after.map(i => i.name));
  } catch (e) {
    console.error('Fix indexes error:', e);
  } finally {
    await mongoose.connection.close();
    console.log('Done. Connection closed.');
    process.exit(0);
  }
})();