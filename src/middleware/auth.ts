import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  role: 'admin' | 'leader' | 'telecaller';
  leaderId?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const auth =
  (roles: string[] = []) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
      req.user = decoded;
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
