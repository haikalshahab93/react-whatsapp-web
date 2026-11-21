import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from './support.mjs';

const h = await startHarness();
test.after(() => h.stop());

const ENDPOINT = 'https://push.example.test/subscription/abc123';

test('push key is reported as unavailable when VAPID keys are not configured', async () => {
  const user = await h.createUser();
  const res = await h.api('GET', '/api/push/key', { token: user.token });
  assert.equal(res.status, 200);
  assert.equal(res.data.publicKey, null);
});

test('push endpoints require authentication', async () => {
  const key = await h.api('GET', '/api/push/key');
  assert.equal(key.status, 401);

  const subscribe = await h.api('POST', '/api/push/subscribe', {
    body: { endpoint: ENDPOINT, keys: { p256dh: 'x', auth: 'y' } },
  });
  assert.equal(subscribe.status, 401);
});

test('a subscription must have an https endpoint and its keys', async () => {
  const user = await h.createUser();

  const missingKeys = await h.api('POST', '/api/push/subscribe', {
    token: user.token,
    body: { endpoint: ENDPOINT },
  });
  assert.equal(missingKeys.status, 400);

  const insecure = await h.api('POST', '/api/push/subscribe', {
    token: user.token,
    body: { endpoint: 'http://push.example.test/abc', keys: { p256dh: 'x', auth: 'y' } },
  });
  assert.equal(insecure.status, 400);
});

test('the same device can subscribe twice without creating duplicates', async () => {
  const user = await h.createUser();
  const body = { endpoint: ENDPOINT, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };

  const first = await h.api('POST', '/api/push/subscribe', { token: user.token, body });
  assert.equal(first.status, 201, JSON.stringify(first.data));

  const second = await h.api('POST', '/api/push/subscribe', {
    token: user.token,
    body: { ...body, keys: { p256dh: 'rotated', auth: 'rotated' } },
  });
  assert.equal(second.status, 200, JSON.stringify(second.data));
});

test('unsubscribing removes the device', async () => {
  const user = await h.createUser();
  const body = { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } };
  await h.api('POST', '/api/push/subscribe', { token: user.token, body });

  const removed = await h.api('DELETE', '/api/push/subscribe', { token: user.token, body });
  assert.equal(removed.status, 200);

  const missingEndpoint = await h.api('DELETE', '/api/push/subscribe', {
    token: user.token,
    body: {},
  });
  assert.equal(missingEndpoint.status, 400);
});

test('sending a message does not break when push is not configured', async () => {
  const ayu = await h.createUser({ name: 'Push Ayu' });
  const bagas = await h.createUser({ name: 'Push Bagas' });
  const request = await h.api('POST', '/api/friends/request', {
    token: ayu.token,
    body: { toUserId: bagas.id },
  });
  await h.api('POST', `/api/friends/request/${request.data.request._id}/accept`, {
    token: bagas.token,
  });
  const chat = await h.api('POST', '/api/chats', { token: ayu.token, body: { members: [bagas.id] } });
  const sent = await h.api('POST', '/api/messages', {
    token: ayu.token,
    body: { chat: chat.data._id, content: 'Message with push disabled' },
  });
  assert.equal(sent.status, 201);
});
