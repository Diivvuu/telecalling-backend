import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Goal } from '../models/Goal';
import { ActivityLog } from '../models/ActivityLog';

/**
 * Create a goal
 * Admin or Leader can assign to any user
 * Telecaller can set their own
 */
export const createGoal = async (req: AuthRequest, res: Response) => {
  const { userId, type, target, startDate, endDate } = req.body;

  // derive period automatically from type
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

/**
 * List goals
 * Admin sees all, Leader sees team, Telecaller sees their own
 */
export const listGoals = async (req: AuthRequest, res: Response) => {
  const filter: any = {};
  if (req.user!.role !== 'admin') filter.userId = req.user!.id;

  const goals = await Goal.find(filter)
    .populate('userId', 'firstName lastName email role')
    .sort({ createdAt: -1 });

  res.json(goals);
};

/**
 * Increment goal progress automatically
 * Called by call controller etc.
 */
export const updateGoalProgress = async (userId: string, type: string) => {
  await Goal.updateOne(
    {
      userId,
      type,
      endDate: { $gte: new Date() },
      startDate: { $lte: new Date() },
    },
    { $inc: { achieved: 1 } }
  );
};