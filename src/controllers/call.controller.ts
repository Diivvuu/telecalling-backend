import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CallLog } from '../models/CallLog';
import { Lead } from '../models/Lead';
import { ActivityLog } from '../models/ActivityLog';
import { updateGoalProgress } from './goal.controller';

export const createCallLog = async (req: AuthRequest, res: Response) => {
  const { leadId, duration, result, remarks } = req.body;
  if (!leadId || !duration || !result)
    return res.status(400).json({ error: 'Missing required fields' });

  // Ensure lead exists and belongs to the user
  const lead = await Lead.findById(leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (
    req.user!.role === 'telecaller' &&
    String(lead.assignedTo) !== req.user!.id
  )
    return res
      .status(403)
      .json({ error: 'You can log calls only for your assigned leads' });

  // 1️⃣ Create call log
  const call = await CallLog.create({
    leadId,
    telecallerId: req.user!.id,
    duration,
    result,
    remarks,
  });

  // 2️⃣ Update lead stats
  const updates: any = {
    $inc: { callCount: 1 },
    lastCallAt: new Date(),
  };
  if (result === 'callback') updates.status = 'callback';
  if (result === 'converted') updates.status = 'closed';
  await Lead.findByIdAndUpdate(leadId, updates);

  // 3️⃣ Update goals
  await updateGoalProgress(req.user!.id, 'daily_calls');
  if (result === 'converted')
    await updateGoalProgress(req.user!.id, 'conversions');

  // 4️⃣ Log activity
  await ActivityLog.create({
    userId: req.user!.id,
    action: 'CREATE_CALL_LOG',
    targetId: leadId,
    meta: { result, remarks },
  });

  res.status(201).json(call);
};

export const listCallLogs = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  if (req.user!.role === 'telecaller') filter.telecallerId = req.user!.id;
  if (req.query.leadId) filter.leadId = req.query.leadId;

  const logs = await CallLog.find(filter)
    .populate('leadId', 'name phone')
    .sort({ createdAt: -1 });

  res.json(logs);
};
