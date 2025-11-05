import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Lead } from '../models/Lead';

export const getDashboardSummary = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const filter: any = {};

  if (user.role === 'leader') filter.leaderId = user.id;
  if (user.role === 'telecaller') filter.assignedTo = user.id;

  const [totalLeads, statusCounts, todayCalls] = await Promise.all([
    Lead.countDocuments(filter),
    Lead.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Lead.countDocuments({
      ...filter,
      lastCallAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(),
      },
    }),
  ]);

  const formattedStatus = statusCounts.reduce(
    (acc: any, s) => ({ ...acc, [s._id]: s.count }),
    {}
  );

  let topTelecallers: any[] = [];
  if (user.role !== 'telecaller') {
    const teamFilter = user.role === 'leader' ? { leaderId: user.id } : {}; //admin sees all
    topTelecallers = await Lead.aggregate([
      { $match: { ...filter, ...teamFilter } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          id: '$user._id',
          email: '$user.email',
          role: '$user.role',
          count: 1,
        },
      },
    ]);
  }

  res.json({
    totalLeads,
    todayCalls,
    statusBreakdown: formattedStatus,
    topTelecallers,
  });
};
