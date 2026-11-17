#!/usr/bin/env node
/**
 * Seeds a development database with demo people, chats and requests, so the app
 * can be explored without registering accounts by hand.
 *
 *   node server/scripts/seed-demo.js                      # http://127.0.0.1:5000
 *   API_URL=http://localhost:8080/api node server/scripts/seed-demo.js
 *
 * Every account uses the password: DemoPass123!
 * Only run this against a development database.
 */
const API = (process.env.API_URL || "http://127.0.0.1:5000/api").replace(/\/$/, "");
const PASSWORD = "DemoPass123!";

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const log = (...args) => console.log(...args);

async function ensureUser(person) {
  const existing = await call("POST", "/auth/login", { email: person.email, password: PASSWORD });
  if (existing.status === 200) return { token: existing.data.token, id: existing.data.user.id };

  const registered = await call("POST", "/auth/register", {
    name: person.name,
    email: person.email,
    password: PASSWORD,
    gender: person.gender,
    birthdate: person.birthdate,
  });
  if (registered.status !== 201) throw new Error(`${person.email}: ${JSON.stringify(registered.data)}`);
  if (registered.data.verificationToken) {
    await call("POST", "/auth/verify", { token: registered.data.verificationToken });
  }
  const login = await call("POST", "/auth/login", { email: person.email, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed for ${person.email}`);

  if (person.profile) await call("PUT", "/users/me", person.profile, login.data.token);
  return { token: login.data.token, id: login.data.user.id };
}

const people = {
  ayu: {
    name: "Ayu Pratama",
    email: "ayu.demo@chateasy.test",
    gender: "female",
    birthdate: "1996-04-12",
    location: { lat: -6.2, lng: 106.82 },
    profile: {
      bio: "Product designer. Trail rides, film photography and strong coffee.",
      interests: ["hiking", "coffee", "photography"],
      languages: ["Indonesian", "English"],
      occupation: "Product designer",
    },
  },
  bagas: {
    name: "Bagas Wirawan",
    email: "bagas.demo@chateasy.test",
    gender: "male",
    birthdate: "1994-11-03",
    location: { lat: -6.205, lng: 106.825 },
    profile: {
      bio: "Cyclist and weekend trail guide. Ask me about the good routes.",
      interests: ["cycling", "hiking", "coffee"],
      languages: ["Indonesian", "English"],
      occupation: "Trail guide",
    },
  },
  citra: {
    name: "Citra Lestari",
    email: "citra.demo@chateasy.test",
    gender: "female",
    birthdate: "1996-02-20",
    location: { lat: -6.215, lng: 106.83 },
    profile: {
      bio: "Baker, reader, and a little obsessed with sourdough.",
      interests: ["books", "baking", "coffee"],
      languages: ["Indonesian"],
      occupation: "Pastry chef",
    },
  },
  gita: {
    name: "Gita Maharani",
    email: "gita.demo@chateasy.test",
    gender: "female",
    birthdate: "1996-09-18",
    location: { lat: -6.198, lng: 106.82 },
    profile: {
      bio: "Weekend hiker and matcha enthusiast. Ask me about the best trails near the city.",
      interests: ["hiking", "coffee", "photography"],
      languages: ["Indonesian", "English"],
      occupation: "Illustrator",
    },
  },
  hana: {
    name: "Hana Kusuma",
    email: "hana.demo@chateasy.test",
    gender: "female",
    birthdate: "1993-12-01",
    location: { lat: -6.21, lng: 106.83 },
    profile: {
      bio: "Runner, reader, and amateur cook. Always up for a long walk and a good story.",
      interests: ["running", "books", "cooking"],
      languages: ["Indonesian"],
      occupation: "Architect",
    },
  },
  raka: {
    name: "Raka Saputra",
    email: "raka.demo@chateasy.test",
    gender: "male",
    birthdate: "1995-06-06",
    location: { lat: -6.19, lng: 106.81 },
    profile: {
      bio: "Product manager by day, guitarist by night.",
      interests: ["music", "coffee", "cycling"],
      languages: ["Indonesian", "English"],
      occupation: "Product manager",
    },
  },
};

const dmMessages = [
  ["bagas", "Hey Ayu! Great meeting you at the trailhead yesterday."],
  ["ayu", "Hey Bagas! Happy we connected here 👋"],
  ["bagas", "Hi Ayu! Same. That meetup was fun."],
  ["ayu", "Are you joining the trail ride on Saturday?"],
  ["bagas", "Planning to. Want me to send you the route?"],
  ["ayu", "Yes please!"],
  ["bagas", "Count me in 🚴"],
];

const groupMessages = [
  ["ayu", "Morning crew! Saturday plan is still on?"],
  ["bagas", "Yes — 6am at the north gate, back before lunch."],
  ["citra", "I'll bring the snacks 🍞"],
  ["ayu", "Perfect. I'll pack the first aid kit."],
];

(async () => {
  log("Seeding demo data against", API);

  const users = {};
  for (const [key, person] of Object.entries(people)) {
    users[key] = await ensureUser(person);
    if (person.location) await call("POST", "/discovery/location", person.location, users[key].token);
    log(`  user ready: ${person.name}`);
  }

  // Ayu and Bagas are friends, so they can message each other.
  const acceptExisting = async () => {
    const sent = await call("GET", "/friends/requests/sent", null, users.ayu.token);
    const pending = (Array.isArray(sent.data) ? sent.data : []).find(
      (r) => String(r.to?._id || r.to?.id || r.to) === String(users.bagas.id) && r.status === "pending"
    );
    if (!pending) return false;
    await call("POST", `/friends/request/${pending._id}/accept`, null, users.bagas.token);
    return true;
  };

  if (!(await acceptExisting())) {
    const request = await call("POST", "/friends/request", { toUserId: users.bagas.id }, users.ayu.token);
    const requestId = request.data?.request?._id;
    if (request.status === 201 && requestId) {
      await call("POST", `/friends/request/${requestId}/accept`, null, users.bagas.token);
    } else {
      await acceptExisting();
    }
  }
  const friendships = await call("GET", "/friends/", null, users.ayu.token);
  log(`  friendship: Ayu & Bagas (${Array.isArray(friendships.data) ? friendships.data.length : 0} friend(s))`);

  // Private conversation with a realistic back-and-forth.
  const dm = await call("POST", "/chats", { members: [users.bagas.id] }, users.ayu.token);
  const dmId = dm.data._id;
  for (const [sender, content] of dmMessages) {
    await call("POST", "/messages", { chat: dmId, content, type: "text" }, users[sender].token);
  }
  log("  direct chat:", dmId);

  // Group with admins.
  const groups = await call("GET", "/chats", null, users.ayu.token);
  let groupId = (groups.data || []).find((c) => c.isGroup && c.name === "Weekend Trail Crew")?._id;
  if (!groupId) {
    const group = await call(
      "POST",
      "/chats",
      {
        isGroup: true,
        name: "Weekend Trail Crew",
        description: "Saturday rides, coffee stops and the occasional flat tyre.",
        members: [users.bagas.id, users.citra.id],
      },
      users.ayu.token
    );
    groupId = group.data._id;
  }
  for (const [sender, content] of groupMessages) {
    await call("POST", "/messages", { chat: groupId, content, type: "text" }, users[sender].token);
  }
  log("  group chat:", groupId);

  // Discovery signal: a few people nearby have liked Ayu, and Citra has sent a request.
  await call("POST", "/discovery/like", { userId: users.ayu.id }, users.gita.token);
  await call("POST", "/discovery/like", { userId: users.ayu.id }, users.hana.token);
  const received = await call("GET", "/friends/requests/received", null, users.ayu.token);
  const hasCitra = Array.isArray(received.data) && received.data.some((r) => r.from?.name === people.citra.name);
  if (!hasCitra) {
    await call(
      "POST",
      "/friends/request",
      { toUserId: users.ayu.id, message: "Hi Ayu, we met at the bakery class" },
      users.citra.token
    );
  }
  log("  likes + pending friend request from Citra");

  log("\nDone. Sign in with ayu.demo@chateasy.test / DemoPass123!");
})().catch((error) => {
  console.error("Seeding failed:", error.message);
  process.exit(1);
});
