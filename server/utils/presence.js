/**
 * In-memory presence registry. One process only — if you scale horizontally, replace with a
 * shared store (Redis). Counts sockets per user so multiple tabs stay "online" correctly.
 */
const socketsByUser = new Map();

function addSocket(userId, socketId) {
  const key = String(userId);
  const set = socketsByUser.get(key) || new Set();
  set.add(socketId);
  socketsByUser.set(key, set);
  return set.size;
}

function removeSocket(userId, socketId) {
  const key = String(userId);
  const set = socketsByUser.get(key);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) {
    socketsByUser.delete(key);
    return 0;
  }
  return set.size;
}

function isOnline(userId) {
  return socketsByUser.has(String(userId));
}

function onlineIds() {
  return new Set(socketsByUser.keys());
}

module.exports = { addSocket, removeSocket, isOnline, onlineIds };
