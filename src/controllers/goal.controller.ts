import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Goal, GoalType } from '../models/Goal';
import { ActivityLog } from '../models/ActivityLog';

/** CREATE goal */
export const createGoal = async (req: AuthRequest, res: Response) => {
  const { userId, type, target, startDate, endDate } = req.body as {
    userId?: string;
    type: GoalType;
    target: number;
    startDate: string;
    endDate: string;
  };

  const period =
    type === 'daily_calls' || type === 'conversions' ? 'daily' : 'weekly';

  const goal = await Goal.create({
    userId: userId || req.user!.id,
    type,
    period,
    target,
    startDate,
    endDate,
  });

  await ActivityLog.create({
    userId: req.user!.id,
    action: 'CREATE_GOAL',
    targetId: goal._id,
  });

  res.status(201).json(goal);
};

/** LIST goals (admin all, others own) */
export const listGoals = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  if (req.user!.role !== 'admin') filter.userId = req.user!.id;

  const goals = await Goal.find(filter)
    .populate('userId', 'firstName lastName email role')
    .sort({ createdAt: -1 });

  res.json(goals);
};
