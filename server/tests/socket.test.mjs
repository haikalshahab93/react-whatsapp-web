import test from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { startHarness } from './support.mjs';

const h = await startHarness();
test.after(() => h.stop());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitFor(socket, event, predicate = () => true, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"`));
    }, timeoutMs);
    const handler = (payload) => {
      let matches = false;
      try {
        matches = predicate(payload);
      } catch {
        matches = false;
      }
      if (!matches) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function openSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = connect(h.base, {
      auth: { token },
      reconnection: false,
      timeout: 5000,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

async function friendsWithChat() {
  const a = await h.createUser({ name: 'Socket Ayu', gender: 'female' });
  const b = await h.createUser({ name: 'Socket Bagas', gender: 'male' });
  const request = await h.api('POST', '/api/friends/request', {
    token: a.token,
    body: { toUserId: b.id },
  });
  const requestId = request.data.request?._id;
  assert.ok(requestId, 'friend request id is returned');
  await h.api('POST', `/api/friends/request/${requestId}/accept`, { token: b.token });
  // Accepting opens the conversation, so the chat may already exist here.
  const chat = await h.api('POST', '/api/chats', { token: a.token, body: { members: [b.id] } });
  assert.ok([200, 201].includes(chat.status), JSON.stringify(chat.data));
  return { a, b, chatId: chat.data._id };
}

test('a socket without a token is rejected during the handshake', async () => {
  const socket = connect(h.base, { auth: {}, reconnection: false, timeout: 5000 });
  const error = await waitFor(socket, 'connect_error', (err) => /token/i.test(String(err?.message)));
  assert.match(String(error.message), /token/i);
  socket.close();
});

test('messages sent over HTTP reach members of the conversation in real time', async () => {
  const { a, b, chatId } = await friendsWithChat();
  const watcher = await openSocket(b.token);
  try {
    watcher.emit('chat:join', chatId);
    await sleep(250); // let the server verify membership and join the room

    const delivered = waitFor(watcher, 'message:created', (message) => message.content === 'Realtime hello');
    const sent = await h.api('POST', '/api/messages', {
      token: a.token,
      body: { chat: chatId, content: 'Realtime hello' },
    });
    assert.equal(sent.status, 201);

    const message = await delivered;
    assert.equal(String(message.chat), String(chatId));
    assert.equal(String(message.sender?._id || message.sender), String(a.id));
  } finally {
    watcher.close();
  }
});

test('typing indicators are relayed to the other members only', async () => {
  const { a, b, chatId } = await friendsWithChat();
  const watcher = await openSocket(b.token);
  const typer = await openSocket(a.token);
  try {
    watcher.emit('chat:join', chatId);
    typer.emit('chat:join', chatId);
    await sleep(250);

    const typing = waitFor(
      watcher,
      'typing',
      (payload) => String(payload.userId) === String(a.id) && payload.typing === true
    );
    typer.emit('typing', { chatId, typing: true });
    const payload = await typing;
    assert.equal(String(payload.chatId), String(chatId));
  } finally {
    watcher.close();
    typer.close();
  }
});

test('a friend request notifies the recipient over the socket', async () => {
  const recipient = await h.createUser({ name: 'Socket Notify', gender: 'female' });
  const sender = await h.createUser({ name: 'Socket Sender', gender: 'male' });
  const watcher = await openSocket(recipient.token);
  try {
    const notified = waitFor(
      watcher,
      'notification:new',
      (note) => String(note.title || '').includes('Socket Sender')
    );
    const sent = await h.api('POST', '/api/friends/request', {
      token: sender.token,
      body: { toUserId: recipient.id },
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.data));

    const notification = await notified;
    assert.equal(String(notification.user), String(recipient.id));
  } finally {
    watcher.close();
  }
});

test('a socket cannot post into a conversation it does not belong to', async () => {
  const { chatId } = await friendsWithChat();
  const outsider = await h.createUser({ name: 'Socket Outsider', gender: 'male' });
  const socket = await openSocket(outsider.token);
  try {
    const failure = waitFor(socket, 'error', (payload) => /not a member/i.test(String(payload?.message)));
    socket.emit('message:new', { chatId, content: 'Sneaking in' });
    const payload = await failure;
    assert.match(String(payload.message), /not a member/i);
  } finally {
    socket.close();
  }
});
