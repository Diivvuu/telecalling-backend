import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Lead } from '../models/Lead';
import { ActivityLog } from '../models/ActivityLog';
import { CallLog, CallResult } from '../models/Call';
import { Goal, GoalType } from '../models/Goal';

export const createCallLog = async (req: AuthRequest, res: Response) => {
  const { leadId, duration, result, remarks, nextCallDate } = req.body as {
    leadId: string;
    duration: number;
    result: CallResult;
    remarks?: string;
    nextCallDate?: string;
  };

  if (!leadId || typeof duration !== 'number' || !result)
    return res.status(400).json({ error: 'Missing required fields' });

  const lead = await Lead.findById(leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  // telecaller can only log calls for own leads
  if (
    req.user!.role === 'telecaller' &&
    String(lead.assignedTo) !== req.user!.id
  )
    return res
      .status(403)
      .json({ error: 'You can log calls only for your assigned leads' });

  // 1) Create call log
  const call = await CallLog.create({
    leadId,
    telecallerId: req.user!.id,
    duration,
    result,
    remarks,
  });

  // 2) Update lead stats (ONLY here)
  const leadUpdate: any = {
    $inc: { callCount: 1 },
    $set: { lastCallAt: new Date() },
  };

  if (result === 'callback') {
    leadUpdate.$set.status = 'callback';
    if (nextCallDate) leadUpdate.$set.nextCallDate = new Date(nextCallDate);
  }
  if (result === 'converted') {
    leadUpdate.$set.status = 'closed';
  }

  const updatedLead = await Lead.findByIdAndUpdate(leadId, leadUpdate, {
    new: true,
  });

  async function incrementGoalProgress(userId: string, type: GoalType) {
    await Goal.updateOne(
      {
        userId,
        type,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
      },
      { $inc: { achieved: 1 } }
    ).exec();
  }

  // 3) Update goals
  await incrementGoalProgress(req.user!.id, 'daily_calls');
  if (result === 'converted')
    await incrementGoalProgress(req.user!.id, 'conversions');

  // 4) Activity
  await ActivityLog.create({
    userId: req.user!.id,
    action: 'CREATE_CALL_LOG',
    targetId: leadId,
    meta: { result, remarks, duration },
  });

  res.status(201).json({ call, lead: updatedLead });
};

export const listCallLogs = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  if (req.user!.role === 'telecaller') filter.telecallerId = req.user!.id;
  if (req.query.leadId) filter.leadId = req.query.leadId;

  const logs = await CallLog.find(filter)
    .populate('leadId', 'name phone status')
    .populate('telecallerId', 'fullName email')
    .sort({ createdAt: -1 });

  res.json(logs);
};
