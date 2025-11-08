import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/Users';
import { ActivityLog } from '../models/ActivityLog';
import { Goal } from '../models/Goal';

/** 🔹 List Users */

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
  if (search) {
    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
    ];
  }

  if (req.user!.role === 'leader') {
    filter.$or = [
      { _id: new mongoose.Types.ObjectId(req.user!.id) },
      { leaderId: new mongoose.Types.ObjectId(req.user!.id) },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip((p - 1) * ps)
      .limit(ps),
    User.countDocuments(filter),
  ]);

  // Attach goals for telecallers
  const userIds = users.map((u) => u._id);
  const goals = await Goal.find({
    userId: { $in: userIds },
    endDate: { $gte: new Date() },
  }).lean();

  const items = users.map((u) => {
    const userGoals = goals.filter((g) => String(g.userId) === String(u._id));
    const dailyGoal = userGoals.find((g) => g.type === 'daily_calls');
    const conversionGoal = userGoals.find((g) => g.type === 'conversions');
    return {
      ...u.toObject(),
      goals: {
        daily_calls: dailyGoal || null,
        conversions: conversionGoal || null,
      },
    };
  });

  res.json({ items, total, page: p, pageSize: ps });
};

/** 🔹 Create User */
export const createUser = async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, email, phone, password, role, leaderId } =
    req.body;

  if (!firstName || !email || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // role-based restrictions
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
  if (existing) return res.status(409).json({ error: 'Email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    passwordHash,
    role,
    leaderId:
      role === 'telecaller'
        ? req.user!.role === 'leader'
          ? req.user!.id
          : leaderId || null
        : null,
  });

  await ActivityLog.create({
    userId: req.user!.id,
    action: 'CREATE_USER',
    targetId: user._id,
    meta: { role: user.role, email: user.email },
  });

  res.status(201).json({
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    leaderId: user.leaderId,
  });
};

/** 🔹 Update User */
/** 🔹 Update User */
export const updateUser = async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can update users' });
  }

  const { id } = req.params;
  const { firstName, lastName, phone, password, role, active, leaderId } =
    req.body;
  const update: any = {};

  if (firstName) update.firstName = firstName;
  if (lastName) update.lastName = lastName;
  if (phone) update.phone = phone;
  if (password) update.passwordHash = await bcrypt.hash(password, 10);
  if (role) update.role = role;
  if (active !== undefined) update.active = active;

  if (leaderId && role === 'telecaller') {
    if (req.user!.role !== 'admin') {
      return res
        .status(403)
        .json({ error: 'Only admin can change leader mapping' });
    }
    update.leaderId = new mongoose.Types.ObjectId(leaderId);
  }

  // rebuild fullName
  if (firstName || lastName)
    update.fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();

  const user = await User.findByIdAndUpdate(id, update, { new: true })
    .select('-passwordHash')
    .populate('leaderId', 'fullName email role');

  if (!user) return res.status(404).json({ error: 'User not found' });

  await ActivityLog.create({
    userId: req.user!.id,
    action: 'UPDATE_USER',
    targetId: id,
    meta: { updatedFields: Object.keys(update) },
  });

  res.json(user);
};

/** 🔹 Get User */
export const getUser = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = await User.findById(id)
    .select('-passwordHash')
    .populate('leaderId', 'fullName email role');
  if (!user) return res.status(404).json({ error: 'User not found' });

  const requester = req.user!;
  const isSelf = requester.id === id;

  if (
    requester.role !== 'admin' &&
    !isSelf &&
    !(requester.role === 'leader' && String(user.leaderId) === requester.id)
  ) {
    return res.status(403).json({ error: 'Forbidden: insufficient access' });
  }

  // Fetch active goals
  const goals = await Goal.find({
    userId: id,
    endDate: { $gte: new Date() },
  }).lean();

  const dailyGoal = goals.find((g) => g.type === 'daily_calls');
  const conversionGoal = goals.find((g) => g.type === 'conversions');

  res.json({
    ...user.toObject(),
    goals: {
      daily_calls: dailyGoal || null,
      conversions: conversionGoal || null,
    },
  });
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete user' });
  }

  const { id } = req.params;
  const target = await User.findById(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // 🚫 Prevent self-deletion
  if (String(req.user!.id) === String(id)) {
    return res
      .status(403)
      .json({ error: 'You cannot delete your own account' });
  }

  // 🧩 Check admin safety
  if (target.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });

    if (adminCount <= 1) {
      return res
        .status(400)
        .json({ error: 'Cannot delete the last remaining admin' });
    }
  }

  await User.findByIdAndDelete(id);

  await ActivityLog.create({
    userId: req.user!.id,
    action: 'DELETE_USER',
    targetId: id,
    meta: { email: target.email, role: target.role },
  });

  res.json({ success: true, id });
};
