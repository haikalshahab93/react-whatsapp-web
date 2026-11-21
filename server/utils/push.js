const webpush = require('web-push');
const { PushSubscription } = require('../models/Social');

/**
 * Web Push delivery. Everything degrades gracefully: without VAPID keys the app
 * simply behaves as before and no push is attempted.
 */
let configured = false;

function ensureConfigured() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      publicKey,
      privateKey
    );
    configured = true;
  }
  return true;
}

function publicPushKey() {
  return ensureConfigured() ? process.env.VAPID_PUBLIC_KEY : null;
}

/**
 * Sends one push per registered device of the user. Expired endpoints (404/410) are
 * removed so the collection cannot grow forever. Never throws.
 */
async function sendPushToUser(userId, { title, body = '', url = '/chats', tag } = {}) {
  if (!ensureConfigured() || !title) return 0;
  let subscriptions = [];
  try {
    subscriptions = await PushSubscription.find({ user: userId }).lean();
  } catch {
    return 0;
  }
  if (!subscriptions.length) return 0;

  const payload = JSON.stringify({ title, body, url, tag });
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        payload
      )
    )
  );

  const stale = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const status = result.reason && result.reason.statusCode;
      if (status === 404 || status === 410) stale.push(subscriptions[index]._id);
    }
  });
  if (stale.length) {
    await PushSubscription.deleteMany({ _id: { $in: stale } }).catch(() => {});
  }
  return results.filter((r) => r.status === 'fulfilled').length;
}

module.exports = { sendPushToUser, publicPushKey };
