const { Notification } = require('../models/Social');

/**
 * Persists a notification and pushes it to the recipient's room in realtime.
 * Never throws: a failed notification must not break the primary action.
 */
async function notify(io, { user, type = 'system', title, body = '', data = {} }) {
  try {
    const doc = await Notification.create({ user, type, title, body, data });
    if (io) io.to(`user:${user}`).emit('notification:new', doc);
    return doc;
  } catch (e) {
    console.warn('notify failed:', e && e.message);
    return null;
  }
}

module.exports = { notify };
