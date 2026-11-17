import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from './support.mjs';

const h = await startHarness();
test.after(() => h.stop());

test('health reports a connected database', async () => {
  const res = await h.api('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'ok');
  assert.equal(res.data.db, 'connected');
});

test('a new account can register, verify and sign in', async () => {
  const user = await h.createUser();

  const me = await h.api('GET', '/api/auth/me', { token: user.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.email, user.email);
  assert.equal(me.data.name, user.name);
  // The public shape must never include the password hash.
  assert.equal(me.data.passwordHash, undefined);

  const chats = await h.api('GET', '/api/chats', { token: user.token });
  assert.equal(chats.status, 200);
  assert.deepEqual(chats.data, []);
});

test('an unverified account cannot sign in until the token is used', async () => {
  const email = `unverified.${process.pid}@example.test`;
  const registered = await h.api('POST', '/api/auth/register', {
    body: {
      name: 'Unverified Person',
      email,
      password: h.password,
      gender: 'male',
      birthdate: '1994-01-01',
    },
  });
  assert.equal(registered.status, 201);
  assert.ok(registered.data.verificationToken, 'dev fallback token is returned without SMTP');

  const blocked = await h.api('POST', '/api/auth/login', { body: { email, password: h.password } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'unverified');

  const verified = await h.api('POST', '/api/auth/verify', {
    body: { token: registered.data.verificationToken },
  });
  assert.equal(verified.status, 200);

  const login = await h.api('POST', '/api/auth/login', { body: { email, password: h.password } });
  assert.equal(login.status, 200);
  assert.ok(login.data.token);
});

test('a wrong password is rejected', async () => {
  const user = await h.createUser();
  const res = await h.api('POST', '/api/auth/login', {
    body: { email: user.email, password: 'definitely-not-the-password' },
  });
  assert.equal(res.status, 401);
});

test('protected routes reject missing and invalid tokens', async () => {
  const anonymous = await h.api('GET', '/api/chats');
  assert.equal(anonymous.status, 401);

  const forged = await h.api('GET', '/api/auth/me', { token: 'not.a.real.token' });
  assert.equal(forged.status, 401);
});

test('an email address cannot be registered twice', async () => {
  const user = await h.createUser();
  const duplicate = await h.api('POST', '/api/auth/register', {
    body: {
      name: 'Second Account',
      email: user.email,
      password: h.password,
      gender: 'male',
      birthdate: '1990-01-01',
    },
  });
  assert.ok(
    duplicate.status === 400 || duplicate.status === 409,
    `unexpected status for a duplicate email: ${duplicate.status}`
  );
  assert.ok(duplicate.data?.message);
});

test('a forgotten password can be reset and the old password stops working', async () => {
  const user = await h.createUser();

  const forgot = await h.api('POST', '/api/auth/forgot', { body: { email: user.email } });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.data.resetToken, 'reset token is exposed when SMTP is not configured');

  const nextPassword = 'BrandNewPass123!';
  const reset = await h.api('POST', '/api/auth/reset', {
    body: { token: forgot.data.resetToken, password: nextPassword },
  });
  assert.equal(reset.status, 200);

  const withNewPassword = await h.api('POST', '/api/auth/login', {
    body: { email: user.email, password: nextPassword },
  });
  assert.equal(withNewPassword.status, 200);

  const withOldPassword = await h.api('POST', '/api/auth/login', {
    body: { email: user.email, password: user.password },
  });
  assert.equal(withOldPassword.status, 401);
});
