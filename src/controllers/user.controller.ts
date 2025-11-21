import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/Users';
import { ActivityLog } from '../models/ActivityLog';
import { Goal } from '../models/Goal';
import moment from 'moment';
import { Lead } from '../models/Lead';
import { CallLog } from '../models/Call';

/* ======================================================
   📌 LIST USERS
====================================================== */
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
      { email: new RegExp(search, 'i') },
      { fullName: new RegExp(search, 'i') },
    ];
  }

  // Leader can only see themselves + their telecallers
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

  // Attach weekly goals (only active ones)
  const userIds = users.map((u) => u._id);
  const goals = await Goal.find({
    userId: { $in: userIds },
    type: 'weekly_calls',
    endDate: { $gte: new Date() },
  }).lean();

  const items = users.map((u) => {
    const userGoal = goals.find((g) => String(g.userId) === String(u._id));
    return {
      ...u.toObject(),
      weeklyGoal: userGoal || null,
    };
  });

  res.json({ items, total, page: p, pageSize: ps });
};

/* ======================================================
   📌 CREATE USER
====================================================== */
export const createUser = async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, email, phone, password, role, leaderId } =
    req.body;
  if (!firstName || !email || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (req.user!.role === 'leader' && role !== 'telecaller') {
    return res
      .status(403)
      .json({ error: 'Leader can only create telecallers' });
  }

  if (req.user!.role === 'leader' && leaderId && leaderId !== req.user!.id) {
    return res.status(400).json({ error: 'leaderId must be own ID' });
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
    meta: { email: user.email, role: user.role },
  });

  res.status(201).json({
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    leaderId: user.leaderId,
  });
};

/* ======================================================
   📌 UPDATE USER (Admin Only)
====================================================== */
export const updateUser = async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin')
    return res.status(403).json({ error: 'Only admin can update users' });

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
  if (leaderId && role === 'telecaller')
    update.leaderId = new mongoose.Types.ObjectId(leaderId);
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

/* ======================================================
   📌 GET USER + ACTIVE WEEKLY GOAL
====================================================== */
export const getUser = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const user = await User.findById(id)
    .select('-passwordHash')
    .populate('leaderId', 'fullName email role');

  if (!user) return res.status(404).json({ error: 'User not found' });

  const requester = req.user!;
  const allowed =
    requester.role === 'admin' ||
    requester.id === id ||
    (requester.role === 'leader' && String(user.leaderId) === requester.id);

  if (!allowed) return res.status(403).json({ error: 'Forbidden' });

  const goal = await Goal.findOne({
    userId: id,
    type: 'weekly_calls',
    endDate: { $gte: new Date() },
  }).lean();

  res.json({ ...user.toObject(), weeklyGoal: goal || null });
};

/* ======================================================
   📌 DELETE USER
====================================================== */
export const deleteUser = async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin')
    return res.status(403).json({ error: 'Only admin can delete user' });
  const { id } = req.params;

  const target = await User.findById(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (String(req.user!.id) === String(id))
    return res.status(403).json({ error: 'Cannot delete own account' });

  if (
    target.role === 'admin' &&
    (await User.countDocuments({ role: 'admin' })) <= 1
  ) {
    return res.status(400).json({ error: 'Cannot delete last admin' });
  }

  await User.findByIdAndDelete(id);

  await ActivityLog.create({
    userId: req.user!.id,
    action: 'DELETE_USER',
    targetId: id,
    meta: { email: target.email, role: target.role },
  });

  res.json({ success: true });
};

export const getTelecallerLeads = async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { range = 'day', startDate, endDate, status } = req.query as any;
  const requester = req.user!;

  if (requester.role === 'telecaller')
    return res
      .status(403)
      .json({ error: 'Telecallers cannot view other telecallers` leads' });

  let start: Date, end: Date;
  const now = moment();

  if (range === 'day') {
    start = now.startOf('day').toDate();
    end = now.endOf('day').toDate();
  } else if (range === 'week') {
    start = now.startOf('week').toDate();
    end = now.endOf('week').toDate();
  } else if (range === 'month') {
    start = now.startOf('month').toDate();
    end = now.endOf('month').toDate();
  } else if (range === 'custom' && startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else return res.status(400).json({ error: 'Invalid date range' });

  const leadFilter: any = {
    assignedTo: userId,
    lastCallAt: { $gte: start, $lte: end },
  };
  if (status) leadFilter.status = status;

  const leads = await Lead.find(leadFilter).populate(
    'assignedTo',
    'fullName email'
  );

  res.json({
    success: true,
    dateRange: { start, end },
    count: leads.length,
    leads,
  });
};

export const getTelecallerCalls = async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { range = 'day', startDate, endDate } = req.query as any;
  const requester = req.user!;

  if (requester.role === 'telecaller')
    return res
      .status(403)
      .json({ error: 'Telecaller cannot view other telecallers` calls' });

  let start: Date, end: Date;

  const now = moment();

  if (range === 'day') {
    start = now.startOf('day').toDate();
    end = now.endOf('day').toDate();
  } else if (range === 'week') {
    start = now.startOf('week').toDate();
    end = now.endOf('week').toDate();
  } else if (range === 'month') {
    start = now.startOf('month').toDate();
    end = now.endOf('month').toDate();
  } else if (range === 'custom' && startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else return res.status(400).json({ error: 'Invalid date range' });

  const logs = await CallLog.find({
    telecallerId: userId,
    createdAt: { $gte: start, $lte: end },
  })
    .populate('leadId', 'name phone status')
    .populate('telecallerId', 'fullName email')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    dateRange: { start, end },
    totalCalls: logs.length,
    logs,
  });
};


export const getTelecallerGoal = async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const goal = await Goal.findOne({
    userId,
    type: 'weekly_calls',
    endDate: { $gte: new Date() },
  });

  res.json({ success: true, weeklyGoal: goal || null });
};

export const getTelecallerDashboard = async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const requester = req.user!;

  if (requester.role === 'telecaller')
    return res.status(403).json({ error: 'Telecaller cannot access dashboard of others' });

  const now = moment().toDate();

  const [totalCalls, totalLeadsUpdated, weeklyGoal] = await Promise.all([
    CallLog.countDocuments({ telecallerId: userId }),
    Lead.countDocuments({ assignedTo: userId, lastCallAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
    Goal.findOne({
      userId,
      type: 'weekly_calls',
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).lean(),
  ]);

  res.json({
    success: true,
    userId,
    todayCalls: totalLeadsUpdated,
    totalCalls,
    weeklyGoal,
  });
};