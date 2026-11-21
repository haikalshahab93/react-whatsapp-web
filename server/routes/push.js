const express = require('express');
const { PushSubscription } = require('../models/Social');
const { publicPushKey } = require('../utils/push');
const { cleanString } = require('../utils/validation');

const router = express.Router();

/* Public key the browser needs to subscribe. Null means push is not configured. */
router.get('/key', (req, res) => {
  res.json({ publicKey: publicPushKey() });
});

router.post('/subscribe', async (req, res) => {
  try {
    const endpoint = cleanString(req.body?.endpoint, 500);
    const p256dh = cleanString(req.body?.keys?.p256dh, 200);
    const auth = cleanString(req.body?.keys?.auth, 100);

    if (!endpoint || !/^https:\/\//i.test(endpoint)) {
      return res.status(400).json({ message: 'A valid push endpoint is required' });
    }
    if (!p256dh || !auth) {
      return res.status(400).json({ message: 'Push subscription keys are required' });
    }

    // One row per device: re-subscribing on the same browser updates it instead of duplicating.
    const existing = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: { user: req.user.id, keys: { p256dh, auth }, userAgent: cleanString(req.get('user-agent'), 300) },
        $setOnInsert: { endpoint },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(existing?.createdAt && existing.createdAt.getTime() === existing.updatedAt?.getTime() ? 201 : 200).json({
      message: 'Push subscription saved',
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.delete('/subscribe', async (req, res) => {
  try {
    const endpoint = cleanString(req.body?.endpoint, 500);
    if (!endpoint) return res.status(400).json({ message: 'A push endpoint is required' });
    await PushSubscription.deleteOne({ endpoint, user: req.user.id });
    res.json({ message: 'Push subscription removed' });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
