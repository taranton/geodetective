import { Router } from 'express';
import { query, queryOne, execute } from '../db/connection.js';
import { DbUser, dbUserToPublic } from '../db/models.js';
import { createError } from '../middleware/errorHandler.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

// All routes require admin
router.use(authenticate, requireAdmin);

// GET /api/users - Get all users
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const users = await query<DbUser[]>(
      'SELECT * FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      users: users.map(dbUserToPublic)
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/:id - Update user (approve, change credits, role)
router.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { isApproved, credits, role } = req.body;

    const user = await queryOne<DbUser>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Prevent admin from demoting themselves
    if (id === req.userId && role && role !== 'admin') {
      throw createError('Cannot change your own role', 400, 'CANNOT_CHANGE_OWN_ROLE');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (typeof isApproved === 'boolean') {
      updates.push('is_approved = ?');
      values.push(isApproved);
    }

    if (typeof credits === 'number' && credits >= 0) {
      updates.push('credits = ?');
      values.push(credits);
    }

    if (role && ['admin', 'user'].includes(role)) {
      updates.push('role = ?');
      values.push(role);
    }

    if (updates.length === 0) {
      throw createError('No valid fields to update', 400, 'NO_UPDATES');
    }

    values.push(id);
    await execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updatedUser = await queryOne<DbUser>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      user: dbUserToPublic(updatedUser!)
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.userId) {
      throw createError('Cannot delete your own account', 400, 'CANNOT_DELETE_SELF');
    }

    const user = await queryOne<DbUser>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    await execute('DELETE FROM users WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
