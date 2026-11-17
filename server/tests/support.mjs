/**
 * Test harness: starts a throwaway MongoDB and a real API process, then exposes
 * small helpers for HTTP and account setup. Each test file gets its own database,
 * server process and rate-limit counters, so files cannot interfere with each other.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

export const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'Secret123!';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startHarness() {
  const mongo = await MongoMemoryServer.create();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let log = '';

  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      MONGO_URI: mongo.getUri(),
      JWT_SECRET: 'test-secret',
      PORT: String(port),
      NODE_ENV: 'test',
      // Explicitly blank so the API uses its development email/WhatsApp fallbacks.
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      TWILIO_SID: '',
      TWILIO_AUTH_TOKEN: '',
      TWILIO_WHATSAPP_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    log += chunk;
  });
  child.stderr.on('data', (chunk) => {
    log += chunk;
  });

  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${base}/api/health`);
      ready = res.ok;
    } catch {
      // not listening yet
    }
    if (!ready) await sleep(200);
  }
  if (!ready) {
    child.kill('SIGKILL');
    await mongo.stop();
    throw new Error(`API did not become healthy in time. Output:\n${log}`);
  }

  async function api(method, route, { body, token, raw } = {}) {
    const res = await fetch(base + route, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }

  let sequence = 0;

  /** Registers, verifies and signs in a fresh account. */
  async function createUser(overrides = {}) {
    sequence += 1;
    const email = `user${sequence}.${process.pid}@example.test`;
    const name = overrides.name || `Test User ${sequence}`;
    const registered = await api('POST', '/api/auth/register', {
      body: {
        name,
        email,
        password: PASSWORD,
        gender: overrides.gender || 'female',
        birthdate: overrides.birthdate || '1996-03-03',
        ...(overrides.profile || {}),
      },
    });
    if (registered.status !== 201) {
      throw new Error(`register failed (${registered.status}): ${JSON.stringify(registered.data)}`);
    }
    if (!registered.data.verificationToken) {
      throw new Error('API did not expose a verification token; is SMTP configured in the test env?');
    }
    await api('POST', '/api/auth/verify', { body: { token: registered.data.verificationToken } });
    const login = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    if (login.status !== 200) {
      throw new Error(`login failed (${login.status}): ${JSON.stringify(login.data)}`);
    }
    return { id: login.data.user.id, token: login.data.token, email, password: PASSWORD, name };
  }

  async function stop() {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), sleep(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await mongo.stop();
  }

  return { base, port, api, createUser, stop, output: () => log, password: PASSWORD };
}
