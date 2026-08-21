const jwt = require('jsonwebtoken');
const pool = require('../db');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: 'Authorization header is missing',
    });
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      message: 'Invalid authorization header',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await pool.query(
      `
      SELECT
        id,
        UNIX_TIMESTAMP(password_changed_at) AS password_changed_at_unix
      FROM users
      WHERE id = ?
      `,
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: 'User no longer exists',
      });
    }

    const user = users[0];

    if (
      user.password_changed_at_unix &&
      decoded.iat <= user.password_changed_at_unix
    ) {
      return res.status(401).json({
        message: 'Session expired after password change',
      });
    }

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired token',
    });
  }
};

module.exports = authMiddleware;