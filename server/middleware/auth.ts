import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/connection.js';
import { DbUser, UserPublic, dbUserToPublic } from '../db/models.js';
import { createError } from './errorHandler.js';

export interface AuthRequest extends Request {
  user?: UserPublic;
  userId?: string;
}

interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('No token provided', 401, 'NO_TOKEN');
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'default_secret';

    const decoded = jwt.verify(token, secret) as JwtPayload;

    const user = await queryOne<DbUser>(
      'SELECT * FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      throw createError('User not found', 401, 'USER_NOT_FOUND');
    }

    if (!user.is_approved && user.role !== 'admin') {
      throw createError('Account not approved', 403, 'NOT_APPROVED');
    }

    req.user = dbUserToPublic(user);
    req.userId = user.id;
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return next(createError('Invalid token', 401, 'INVALID_TOKEN'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(createError('Token expired', 401, 'TOKEN_EXPIRED'));
    }
    next(error);
  }
}

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user || req.user.role !== 'admin') {
    return next(createError('Admin access required', 403, 'ADMIN_REQUIRED'));
  }
  next();
}
