import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import { User } from '../models/Users';
import bcrypt from 'bcryptjs';
import { userInfo } from 'os';

export const listUsers = async (req: AuthRequest, res: Response) => {
  const {
    page = '1',
    pageSize = '20',
    role,
    search,
  } = req.query as Record<string, string>;
  const p = Math.max(parseInt(page), 1);
  const ps = Math.min(Math.max(parseInt(pageSize), 1), 100);

  const filter: any = {};

  if (role) filter.role = role;
  if (search) filter.email = { $regex: search, $options: 'i' };

  if (req.user!.role === 'leader') {
    filter.$or = [
      { _id: new mongoose.Types.ObjectId(req.user!.id) },
      { leaderId: new mongoose.Types.ObjectId(req.user!.id) },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip((p - 1) * ps)
      .limit(ps),
    User.countDocuments(filter),
  ]);

  res.json({ items, total, page: p, pageSize: ps });
};

export const createUser = async (req: AuthRequest, res: Response) => {
  const { email, password, role, leaderId } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  //role-based restrictions
  if (req.user!.role === 'leader' && role !== 'telecaller') {
    return res
      .status(403)
      .json({ error: 'Leader can only create telecallers' });
  }
  if (req.user!.role === 'leader' && leaderId && leaderId !== req.user!.id) {
    return res
      .status(400)
      .json({ error: 'leaderId must be self for leader-created users' });
  }

  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: 'Email exists' });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    email,
    passwordHash,
    role,
    leaderId:
      role === 'telecaller'
        ? req.user!.role === 'leader'
          ? req.user!.id
          : leaderId || null
        : null,
  });

  res.status(201).json({
    id: user._id,
    email: user.email,
    role: user.role,
    leaderId: user.leaderId,
  });
};

// admin only user update
export const updateUser = async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can update users' });
  }

  const { id } = req.params;
  const { password, role, active } = req.body;
  const update: any = {};

  if (password) update.passwordHash = await bcrypt.hash(password, 10);
  if (role) update.role = role;
  if (active !== undefined) update.active = active;

  const user = await User.findByIdAndUpdate(id, update, { new: true }).select(
    '-passwordHash'
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json(user);
};

// get single user
export const getUser = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const target = await User.findById(id).select('-passwordHash');

  if (!target) return res.status(404).json({ error: 'User not found' });

  const requester = req.user!;
  const isSelf = requester.id === id;

  if (requester.role === 'admin' || isSelf) {
    return res.json(target);
  }

  if (requester.role === 'leader' && String(target.leaderId) === requester.id)
    return res.json(target);

  return res.status(403).json({ error: 'Forbidden : insufficient access' });
};
