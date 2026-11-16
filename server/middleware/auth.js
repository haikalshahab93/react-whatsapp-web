const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign(
    { id: String(user._id || user.id), email: user.email },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = verifyToken(token);
    req.user = payload; // { id, email }
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

/** Protects routes where the path id must match the authenticated user. */
function requireSelf(param = 'id') {
  return (req, res, next) => {
    if (!req.user || String(req.user.id) !== String(req.params[param])) {
      return res.status(403).json({ message: 'You can only modify your own account' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireSelf, signToken, verifyToken };
