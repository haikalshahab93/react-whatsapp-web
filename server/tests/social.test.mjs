import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from './support.mjs';

const h = await startHarness();
test.after(() => h.stop());

// Shared state between tests in this file: they run in order.
const state = {};

async function becomeFriends(from, to) {
  const sent = await h.api('POST', '/api/friends/request', {
    token: from.token,
    body: { toUserId: to.id },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  // The route answers with { message, request }, so the id lives on `request`.
  const requestId = sent.data.request?._id;
  assert.ok(requestId, 'the created request id is returned');
  const accepted = await h.api('POST', `/api/friends/request/${requestId}/accept`, {
    token: to.token,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  return { requestId, request: sent.data.request };
}

test('friends can open a conversation and exchange messages', async () => {
  const ayu = await h.createUser({ name: 'Ayu Tester', gender: 'female' });
  const bagas = await h.createUser({ name: 'Bagas Tester', gender: 'male' });
  await becomeFriends(ayu, bagas);

  // Accepting a request already opens the direct conversation, so this may return
  // the existing chat (200) instead of creating a new one (201).
  const chat = await h.api('POST', '/api/chats', {
    token: ayu.token,
    body: { members: [bagas.id] },
  });
  assert.ok([200, 201].includes(chat.status), JSON.stringify(chat.data));
  assert.equal(chat.data.isGroup, false);
  assert.equal(chat.data.members.length, 2);

  const sent = await h.api('POST', '/api/messages', {
    token: ayu.token,
    body: { chat: chat.data._id, content: 'Hello from the test suite' },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.content, 'Hello from the test suite');

  // The recipient sees one unread conversation...
  const list = await h.api('GET', '/api/chats', { token: bagas.token });
  const forBagas = list.data.find((c) => String(c._id) === String(chat.data._id));
  assert.ok(forBagas, 'the conversation is listed for the other member');
  assert.equal(forBagas.unreadCount, 1);

  // ...and reading it clears the counter.
  const read = await h.api('POST', `/api/chats/${chat.data._id}/read`, { token: bagas.token });
  assert.equal(read.status, 200);
  const afterRead = await h.api('GET', '/api/chats', { token: bagas.token });
  assert.equal(
    afterRead.data.find((c) => String(c._id) === String(chat.data._id)).unreadCount,
    0
  );

  const history = await h.api('GET', `/api/chats/${chat.data._id}/messages`, { token: bagas.token });
  assert.equal(history.status, 200);
  assert.ok(Array.isArray(history.data.messages));
  assert.ok(history.data.messages.some((m) => m.content === 'Hello from the test suite'));

  state.ayu = ayu;
  state.bagas = bagas;
  state.chatId = chat.data._id;
  state.messageId = sent.data._id;
});

test('strangers cannot start a direct conversation', async () => {
  const citra = await h.createUser({ name: 'Citra Tester', gender: 'female' });
  const dewi = await h.createUser({ name: 'Dewi Tester', gender: 'female' });

  const refused = await h.api('POST', '/api/chats', {
    token: citra.token,
    body: { members: [dewi.id] },
  });
  assert.equal(refused.status, 403, JSON.stringify(refused.data));

  state.citra = citra;
  state.dewi = dewi;
});

test('non-members cannot read or post into a conversation', async () => {
  const history = await h.api('GET', `/api/chats/${state.chatId}/messages`, {
    token: state.citra.token,
  });
  assert.equal(history.status, 404);

  const post = await h.api('POST', '/api/messages', {
    token: state.citra.token,
    body: { chat: state.chatId, content: 'I should not be able to send this' },
  });
  assert.equal(post.status, 403);
});

test('only the author can edit or delete a message', async () => {
  const foreignEdit = await h.api('PUT', `/api/messages/${state.messageId}`, {
    token: state.bagas.token,
    body: { content: 'Hijacked by the other member' },
  });
  assert.equal(foreignEdit.status, 403);

  const edit = await h.api('PUT', `/api/messages/${state.messageId}`, {
    token: state.ayu.token,
    body: { content: 'Edited by the author' },
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(edit.data.content, 'Edited by the author');

  const foreignDelete = await h.api('DELETE', `/api/messages/${state.messageId}`, {
    token: state.bagas.token,
  });
  assert.equal(foreignDelete.status, 403);

  const remove = await h.api('DELETE', `/api/messages/${state.messageId}`, { token: state.ayu.token });
  assert.equal(remove.status, 200);

  const history = await h.api('GET', `/api/chats/${state.chatId}/messages`, { token: state.ayu.token });
  const deleted = history.data.messages.find((m) => String(m._id) === String(state.messageId));
  assert.ok(deleted.deletedAt, 'the deleted message is marked as deleted instead of vanishing');
});

test('a duplicate friend request is rejected instead of created twice', async () => {
  const first = await h.api('POST', '/api/friends/request', {
    token: state.citra.token,
    body: { toUserId: state.ayu.id },
  });
  assert.equal(first.status, 201);

  const duplicate = await h.api('POST', '/api/friends/request', {
    token: state.citra.token,
    body: { toUserId: state.ayu.id },
  });
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate.data));

  state.pendingRequestId = first.data.request._id;
});

test('accepting a request creates one friendship and cannot be repeated', async () => {
  const accepted = await h.api('POST', `/api/friends/request/${state.pendingRequestId}/accept`, {
    token: state.ayu.token,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));

  const friends = await h.api('GET', '/api/friends/', { token: state.ayu.token });
  const ids = friends.data.map((f) => String(f._id || f.id || f));
  assert.ok(ids.includes(String(state.citra.id)));

  const again = await h.api('POST', `/api/friends/request/${state.pendingRequestId}/accept`, {
    token: state.ayu.token,
  });
  assert.ok(again.status >= 400, 'accepting the same request twice must fail');
});

test('nearby discovery respects the distance radius and hides coordinates', async () => {
  const viewer = await h.createUser({ name: 'Viewer Tester', gender: 'male' });
  const close = await h.createUser({ name: 'Nearby Tester', gender: 'female' });
  const far = await h.createUser({ name: 'Distant Tester', gender: 'female' });

  const places = [
    [viewer, { lat: -6.2, lng: 106.82 }],
    [close, { lat: -6.201, lng: 106.821 }],
    [far, { lat: -6.55, lng: 107.05 }], // roughly 47 km away
  ];
  for (const [user, body] of places) {
    const res = await h.api('POST', '/api/discovery/location', { token: user.token, body });
    assert.equal(res.status, 200, JSON.stringify(res.data));
  }

  const near = await h.api('GET', '/api/discovery?gender=all&maxDistanceKm=1', {
    token: viewer.token,
  });
  assert.equal(near.status, 200);
  const nearNames = near.data.results.map((r) => r.name);
  assert.ok(nearNames.includes('Nearby Tester'), `expected the nearby user, got ${nearNames}`);
  assert.ok(!nearNames.includes('Distant Tester'), 'someone 47 km away is outside a 1 km radius');
  const nearbyResult = near.data.results.find((r) => r.name === 'Nearby Tester');
  assert.ok(nearbyResult.distanceLabel, 'people with a location carry an approximate distance label');
  for (const person of near.data.results) {
    assert.equal(person.location, undefined, 'exact coordinates are never returned');
    assert.equal(person.coordinates, undefined, 'exact coordinates are never returned');
  }

  const wide = await h.api('GET', '/api/discovery?gender=all&maxDistanceKm=100', {
    token: viewer.token,
  });
  assert.ok(
    wide.data.results.map((r) => r.name).includes('Distant Tester'),
    'a 100 km radius includes the person 47 km away'
  );

  state.viewer = viewer;
  state.close = close;
  state.far = far;
});

test('blocking removes the friendship and closes the conversation', async () => {
  const blocker = await h.createUser({ name: 'Blocker Tester', gender: 'male' });
  const blocked = await h.createUser({ name: 'Blocked Tester', gender: 'male' });
  await becomeFriends(blocker, blocked);

  const block = await h.api('POST', `/api/friends/block/${blocked.id}`, { token: blocker.token });
  assert.equal(block.status, 200, JSON.stringify(block.data));

  const friends = await h.api('GET', '/api/friends/', { token: blocker.token });
  assert.ok(
    !friends.data.some((f) => String(f._id || f.id || f) === String(blocked.id)),
    'the blocked user is removed from the friend list'
  );

  const blockedList = await h.api('GET', '/api/friends/blocked', { token: blocker.token });
  assert.ok(blockedList.data.some((u) => String(u._id || u.id) === String(blocked.id)));

  // Neither direction can open a conversation while the block stands.
  const attempt = await h.api('POST', '/api/chats', {
    token: blocked.token,
    body: { members: [blocker.id] },
  });
  assert.equal(attempt.status, 403);
});
