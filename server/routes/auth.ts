import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/connection.js';
import { DbUser, dbUserToPublic } from '../db/models.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw createError('Username and password required', 400, 'MISSING_FIELDS');
    }

    if (username.length < 3 || username.length > 50) {
      throw createError('Username must be 3-50 characters', 400, 'INVALID_USERNAME');
    }

    if (password.length < 6) {
      throw createError('Password must be at least 6 characters', 400, 'WEAK_PASSWORD');
    }

    // Check if username exists
    const existing = await queryOne<DbUser>(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existing) {
      throw createError('Username already exists', 409, 'USERNAME_EXISTS');
    }

    // Get default credits from settings
    const settings = await queryOne<{ setting_value: string }>(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['default_credits']
    );
    const defaultCredits = settings ? parseInt(settings.setting_value) : 100;

    // Create user
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await execute(
      `INSERT INTO users (id, username, password_hash, role, credits, is_approved)
       VALUES (?, ?, ?, 'user', ?, FALSE)`,
      [userId, username, passwordHash, defaultCredits]
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please wait for admin approval.'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw createError('Username and password required', 400, 'MISSING_FIELDS');
    }

    const user = await queryOne<DbUser>(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (!user) {
      throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.is_approved && user.role !== 'admin') {
      throw createError('Account pending approval', 403, 'NOT_APPROVED');
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET || 'default_secret';
    const token = jwt.sign(
      { userId: user.id },
      secret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: dbUserToPublic(user)
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res, next) => {
  try {
    // With JWT, logout is handled client-side by removing the token
    // If needed, we can implement token blacklisting here
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    // Re-fetch user to get latest data (credits, etc.)
    const user = await queryOne<DbUser>(
      'SELECT * FROM users WHERE id = ?',
      [req.userId]
    );

    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    res.json({
      success: true,
      user: dbUserToPublic(user)
    });
  } catch (error) {
    next(error);
  }
});

export default router;
