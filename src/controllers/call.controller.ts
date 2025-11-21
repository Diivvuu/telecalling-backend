import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { CallLog, CallResult } from '../models/Call';
import { Lead } from '../models/Lead';
import { ActivityLog } from '../models/ActivityLog';

export const createCallLog = async (req: AuthRequest, res: Response) => {
  const { leadId, result, remarks } = req.body as {
    leadId: string;
    result: CallResult;
    remarks?: string;
  };

  if (!leadId || !result)
    return res.status(400).json({ error: 'Missing required fields' });

  //basic validation
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

  const call = await CallLog.create({
    leadId,
    telecallerId: req.user!.id,
    result,
    remarks,
  });

  // if (remarks) {
  await Lead.findByIdAndUpdate(leadId, {
    $set: { lastCallAt: new Date() },
  });
  // }

  await ActivityLog.create({
    userId: req.user!.id,
    action: 'CREATE_CALL_LOG',
    targetId: leadId,
    meta: { result, remarks },
  });

  res.status(201).json({
    success: true,
    message: 'Call logged successfully',
    call,
  });
};

export const listCallLogs = async (req: AuthRequest, res: Response) => {
  const filter: any = {};

  if (req.user!.role === 'telecaller') {
    filter.telecallerId = req.user!.id;
  }

  if (req.query.leadId) filter.leadId = req.query.leadId;

  const logs = await CallLog.find(filter)
    .populate('leadId', 'name phone status behaviour')
    .populate('telecallerId', 'fullName email')
    .sort({ createdAt: -1 });

  res.json(logs);
};
