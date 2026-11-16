# ChatEasy — Existing Project Audit & Upgrade Plan

_Generated before any modification was made. Findings come from the actual source tree at `36ef986`._

## 1. Executive summary

**There is no Firebase in this project.** `package.json` and `server/package.json` contain no
`firebase`, `firebase-admin`, or `firebase-functions` dependency, there is no `firebase.json`,
no `firestore.rules`, no storage config, and no Firebase initialisation file anywhere in the
tree. Authentication is **email + password implemented with bcrypt + JWT against MongoDB**, and
realtime delivery is **Socket.IO on an Express server**.

The upgrade therefore keeps the existing (fully working) stack and extends it. Migrating to
Firebase Auth/Firestore would violate two hard requirements in the brief: _"do not replace the
existing technology stack without a strong technical reason"_ and _"preserve all existing user
accounts"_ (bcrypt password hashes cannot be exported into Firebase Auth — every user would be
forced through a password reset). No duplicate Firebase configuration was created because no
Firebase project exists in this repository.

## 2. Confirmed architecture

| Area | Finding |
| --- | --- |
| Frontend framework | **React 18.2** with **Create React App** (`react-scripts` 5.0.1), TypeScript 4.8 (`strict: true`) |
| Language | TypeScript (frontend), JavaScript CommonJS (server) |
| Package manager | npm (two separate manifests: root + `server/`, each with its own lockfile) |
| Routing | `react-router-dom` 6.23 via `createBrowserRouter` / `RouterProvider` |
| UI architecture | MUI 5 (`@mui/material`, `@mui/icons-material`, emotion), plus a small `foundation/` layer of reusable components (`ChatCard`, `CustomAppBar`, `CustomMenuButton`) |
| State management | **None** — local `useState` + `useEffect` per page, auth token in `localStorage` (`chateasy_token`, `chateasy_user`) |
| Backend | Express 4.18, Mongoose 7, Socket.IO 4.7, `bcryptjs`, `jsonwebtoken`, `nodemailer`, `twilio` |
| Database | **MongoDB** via Mongoose (`MONGO_URI`, default `mongodb://127.0.0.1:27017/whatsapp_web_clone`) |
| Storage | **None.** `avatarUrl`/attachments are plain URL strings; no upload endpoint exists |
| Realtime | Socket.IO, events: `user:join`, `chat:join`, `message:new`, `message:created`, `chat:created`, `chat:updated`, `typing` |
| Dev topology | CRA dev server on port from `.env` (proxy `/api` → `localhost:5000` via `src/setupProxy.js`), API on 5000 |
| API surface | `/api/health`, `/api/auth/*`, `/api/users/*`, `/api/chats/*`, `/api/messages/*` |

## 3. Existing data model

```
User     { name, email(unique), passwordHash, phone(partial-unique), avatarUrl, statusMessage,
           verified, verificationToken(+Expires), otpHash(+Expires), otpChannel, invitedBy, timestamps }
Chat     { name, isGroup, members[], pinned, lastMessage, timestamps }
Message  { chat, sender, content, type(text|image|file|audio|video|sticker), forwarded, seenBy[], timestamps }
```

## 4. Working features

- Registration with email, bcrypt hashing, verification token, optional inviter.
- Login (email + password) with 7-day JWT; unverified users blocked.
- Email verification endpoint + token link page, plus a Twilio WhatsApp OTP path.
- Invitations by email (`nodemailer`) / WhatsApp (`twilio`) and invite suggestions by email domain
  or phone prefix.
- Chat list, direct chat creation, message send/receive over Socket.IO, typing indicator,
  day separators, sender names, emoji picker, responsive mobile/desktop chat layout.
- DB health chip (`/api/health`), index self-repair on boot (`fix_indexes.js` logic in `index.js`).

## 5. Broken / incomplete / unsafe (found during audit)

1. **No authorization on most endpoints.** Any valid token can list *all* chats
   (`GET /api/chats` without `member`), read *any* chat's messages, post a message as another
   user, delete any message, update/delete any user, and create a chat for arbitrary members.
   This directly contradicts Phase 11 of the brief.
2. Socket.IO accepts `senderId` from the client and joins any chat room without membership
   checks — message spoofing and eavesdropping are possible.
3. `PUT /api/users/:id` and `DELETE /api/users/:id` accept any authenticated caller and pass
   `req.body` straight into Mongo (including `passwordHash`, `verified`, `email`).
4. Chat list query uses `{ members: member }` from the query string — anyone can enumerate
   other users' chats by guessing an id.
5. No pagination on the chat list; message pagination is page/limit only (no cursor), and no
   read receipts are ever persisted (`seenBy` exists but is unused).
6. Buttons that do nothing: header search, "New Group", "Contact Info", filter icon,
   `AttachmentPopover` items, mic button, search chips (All/Unread/Favorites/Groups).
7. Auth pages are minimal; no forgot-password, no reset flow, no resend UI, verification page
   only prints an OTP message, `alert()` is used for success feedback.
8. No dark/light mode toggle (colours are hard-coded WhatsApp dark greens), no skeleton loaders,
   no empty/error states, no toast system.
9. `App.test.tsx` asserts a "learn react" link that does not exist → test suite fails.
10. Dependencies go unused: `socket.io-client` is used, but Twilio is optional at runtime and
    SMTP is optional — invitation/verification silently no-ops when unconfigured (acceptable,
    but it must be surfaced in the UI instead of a fake success).
11. `http-proxy-middleware` is pinned at 0.19.x (2019) — proxying works, but only `/api` is
    proxied, so Socket.IO from the browser is hard-wired to `hostname:5000`, which breaks behind
    any single-origin/proxy deployment.
12. User profiles hold no social data at all: no gender, age, bio, interests, location,
    privacy settings, friends, likes, blocks or reports.

## 6. Upgrade plan (executed in this change set)

**Kept untouched:** React 18 + CRA + TypeScript + MUI, Express + Mongoose + JWT + Socket.IO,
MongoDB URI, existing collections and documents, `/api/auth` register/login/verify/OTP contract,
invite flow, existing component paths and naming conventions.

**Backward-compatible extensions** (all new fields optional, no destructive migration):

```
User       + username, coverUrl, gender, birthdate, bio, interests[], languages[], occupation,
             privacy{discoverable, showAge, showDistance, showOnline, messagesFrom},
             discovery{maxDistanceKm, genderPreference, ageMin, ageMax}, location{lng,lat,updatedAt},
             online, lastActiveAt
Chat       + directKey (unique sparse), admins[], avatarUrl, description, reads[{user,lastReadAt}],
             mutedBy[], leftBy[]
Message    + replyTo, editedAt, deletedAt, reactions[{user,emoji}], deliveredTo[], readBy[],
             media{url,name,mime,size,duration}, forwardedFrom
new        FriendRequest, Friendship, Like, Match, Block, Report, Notification, Media
```

**New backend modules:** `friends`, `discovery`, `notifications`, `uploads/media`, upgraded
`chats`/`messages` with membership checks, cursor pagination, edit/delete/react/forward/search,
read receipts, group admin management, rate limiting, input validation, JWT-authenticated
Socket.IO with presence + WebRTC call signalling.

**New frontend modules:** design system + light/dark theme, auth context, API client, toast
provider, app shell with responsive nav, Discover (swipe + list), Friends (requests/sent/friends/
blocked), Profile & privacy settings, richer chat (attachments, voice notes, reactions, reply,
edit, delete, forward, in-chat search, group management), call UI, skeletons/empty/error states.

**Files modified:** `server/index.js`, `server/models/{User,Chat,Message}.js`,
`server/routes/{auth,users,chats,messages}.js`, `server/middleware/auth.js`, `src/App.tsx`,
`src/theme.ts`, `src/index.css`, `src/setupProxy.js`, `src/feature/pages/**`, `src/foundation/**`,
`src/App.test.tsx`, `README.md`.

**Files added:** see §7.

## 7. Compatibility & risk notes

- No collection is dropped or renamed; no field is removed; existing documents load with defaults.
- Existing accounts keep working: bcrypt hashes untouched, login contract unchanged.
- `Chat.directKey`, `User.username` are **sparse/partial** unique indexes so legacy documents
  (which lack them) do not conflict.
- Media is stored on the API host's filesystem under `server/uploads` and served through an
  authenticated `/api/media/:id` route (never as public static files). If you later move to
  object storage, only `routes/uploads.js` changes.
- Voice/video calls use WebRTC with a public STUN server; **no TURN is included**. Without TURN,
  calls fail for users behind symmetric NAT/mobile carriers. A TURN relay (paid or self-hosted)
  is the only reliable free-of-cost gap; it is documented in `README.md`.
- "Spark plan" wording from the brief maps to this stack as: MongoDB Atlas free tier (M0) +
  any static host for the CRA build + the Node API. No paid service is required for anything
  implemented here; the only optional paid extras are TURN relay and Twilio/SMTP credentials,
  both of which degrade gracefully.
