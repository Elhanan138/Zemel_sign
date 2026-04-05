const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'zemel-secret-key';

function signUserToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    SECRET,
    { expiresIn: '8h' }
  );
}

function signSignerToken(signer, documentId) {
  return jwt.sign(
    { signerId: signer.id, documentId, email: signer.email, name: signer.name },
    SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signUserToken, signSignerToken, verifyToken };
