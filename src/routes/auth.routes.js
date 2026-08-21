const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth.middleware');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');

// Register a new user account
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;


    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'Username, email and password are required',
      });
    }

    if (username.trim().length < 3) {
      return res.status(400).json({
        message: 'Username must be at least 3 characters long',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        message: 'Invalid email address',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long',
      });
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        message: 'Password must contain at least one letter and one number',
      });
    }

    // Hash the password before storing it in the database
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `
      INSERT INTO users
      (username, email, password_hash)
      VALUES (?, ?, ?)
      `,
      [username.trim(), email.trim().toLowerCase(), hashedPassword]
    );

    res.status(201).json({
      message: 'User created successfully',
      userId: result.insertId,
    });

  } catch (error) {
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      message: 'Username or email already exists',
    });
  }

  console.error('Registration error:', error);

return res.status(500).json({
  message: 'Registration failed',
});
}
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many login attempts. Please try again later.',
  },
});

// Authenticate user credentials and log in
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;


    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    const user = users[0];

    // Compare provided password with the stored hash
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '1h',
      }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });

  } catch (error) {
    console.error('Login error:', error);

return res.status(500).json({
  message: 'Login failed',
});
  }
});

// Change authenticated user's password
router.put(
  '/change-password',
  authMiddleware,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          message: 'Current password and new password are required',
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          message: 'New password must be at least 6 characters long',
        });
      }

      if (
        !/[A-Za-z]/.test(newPassword) ||
        !/[0-9]/.test(newPassword)
      ) {
        return res.status(400).json({
          message:
            'New password must contain at least one letter and one number',
        });
      }

      const [users] = await pool.query(
        `
        SELECT id, password_hash
        FROM users
        WHERE id = ?
        `,
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      const user = users[0];

      const passwordMatches = await bcrypt.compare(
        currentPassword,
        user.password_hash
      );

      if (!passwordMatches) {
        return res.status(401).json({
          message: 'Current password is incorrect',
        });
      }

      const sameAsCurrentPassword = await bcrypt.compare(
        newPassword,
        user.password_hash
      );

      if (sameAsCurrentPassword) {
        return res.status(400).json({
          message:
            'New password must be different from current password',
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await pool.query(
        `
        UPDATE users
        SET
          password_hash = ?,
          password_changed_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [hashedPassword, userId]
      );

      return res.json({
        message: 'Password changed successfully',
      });
    } catch (error) {
      console.error('Change password error:', error);

      return res.status(500).json({
        message: 'Failed to change password',
      });
    }
  }
);

// Get authenticated user's account details
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [users] = await pool.query(
      `
      SELECT
        id,
        username,
        email,
        password_changed_at
      FROM users
      WHERE id = ?
      `,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.json(users[0]);
  } catch (error) {
    console.error('Get user details error:', error);

    return res.status(500).json({
      message: 'Failed to load user details',
    });
  }
});

module.exports = router;