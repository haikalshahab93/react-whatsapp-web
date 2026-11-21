const { Notification } = require('../models/Social');
const { sendPushToUser } = require('./push');

/**
 * Persists a notification and pushes it to the recipient's room in realtime.
 * Never throws: a failed notification must not break the primary action.
 */
async function notify(io, { user, type = 'system', title, body = '', data = {} }) {
  try {
    const doc = await Notification.create({ user, type, title, body, data });
    if (io) io.to(`user:${user}`).emit('notification:new', doc);

    // Mirror it to the user's devices when the app is closed (no-op without VAPID keys).
    const chatId = data && typeof data === 'object' ? data.chatId : undefined;
    void sendPushToUser(user, {
      title,
      body,
      url: chatId ? `/chats?chat=${chatId}` : '/friends',
      tag: String(doc._id),
    }).catch(() => {});
    return doc;
  } catch (e) {
    console.warn('notify failed:', e && e.message);
    return null;
  }
}

module.exports = { notify };
