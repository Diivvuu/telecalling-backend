import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import moment from 'moment';
import { Lead } from '../models/Lead';
import { CallLog } from '../models/Call';
import { Goal } from '../models/Goal';
import { User } from '../models/Users';

export const getDashboardSummary = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { range = 'day', startDate, endDate } = req.query as any;

    // 1) Resolve date range
    const now = moment();
    let start: Date;
    let end: Date;

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
    } else {
      return res.status(400).json({ error: 'Invalid range or dates' });
    }

    // 2) Role-based scope filters
    const leadRoleFilter: any = { active: true };
    let telecallerScopeIds: string[] | null = null;

    if (user.role === 'leader') {
      leadRoleFilter.leaderId = user.id;

      // leader: determine team telecallers
      const teamTelecallers = await User.find(
        { leaderId: user.id, role: 'telecaller', active: true },
        '_id'
      ).lean();
      telecallerScopeIds = teamTelecallers.map((t: any) => String(t._id));
    } else if (user.role === 'telecaller') {
      leadRoleFilter.assignedTo = user.id;
    }

    // Call filter for period
    const callMatch: any = { createdAt: { $gte: start, $lte: end } };
    if (user.role === 'telecaller') {
      callMatch.telecallerId = user.id;
    } else if (user.role === 'leader') {
      // if no telecallers in team => no calls
      if (!telecallerScopeIds || telecallerScopeIds.length === 0) {
        callMatch.telecallerId = { $in: [] };
      } else {
        callMatch.telecallerId = { $in: telecallerScopeIds };
      }
    }
    // admin: no restriction

    // 3) Build lead filters for various views
    const leadTotalsFilter = { ...leadRoleFilter }; // current snapshot
    const leadCreatedFilter = {
      ...leadRoleFilter,
      createdAt: { $gte: start, $lte: end },
    };
    const leadUpdatedFilter = {
      ...leadRoleFilter,
      updatedAt: { $gte: start, $lte: end },
    };
    const leadStartedFilter = {
      ...leadRoleFilter,
      lastCallAt: { $gte: start, $lte: end },
    };

    // 4) Run parallel queries
    const [
      // lead totals by status (no date limit)
      leadStatusAgg,
      totalLeads,
      // lead activity in period
      createdInPeriod,
      updatedInPeriodAgg,
      startedInPeriod,
      // call stats in period
      callByResultAgg,
      callPerTelecallerAgg,
      // goal (only for non-admin)
      goalDoc,
      // team telecaller count (for admin/leader)
      teamTelecallerCount,
    ] = await Promise.all([
      // current status breakdown
      Lead.aggregate([
        { $match: leadTotalsFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Lead.countDocuments(leadTotalsFilter),

      // leads created in period
      Lead.countDocuments(leadCreatedFilter),

      // leads updated in period grouped by status
      Lead.aggregate([
        { $match: leadUpdatedFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),

      // leads started in period (new -> anything) via lastCallAt
      Lead.countDocuments(leadStartedFilter),

      // call breakdown by result for this period
      CallLog.aggregate([
        { $match: callMatch },
        {
          $group: {
            _id: '$result',
            count: { $sum: 1 },
          },
        },
      ]),

      // per telecaller stats in this period
      CallLog.aggregate([
        { $match: callMatch },
        {
          $group: {
            _id: '$telecallerId',
            totalCalls: { $sum: 1 },
            answered: {
              $sum: { $cond: [{ $eq: ['$result', 'answered'] }, 1, 0] },
            },
            missed: {
              $sum: { $cond: [{ $eq: ['$result', 'missed'] }, 1, 0] },
            },
            callback: {
              $sum: { $cond: [{ $eq: ['$result', 'callback'] }, 1, 0] },
            },
            converted: {
              $sum: { $cond: [{ $eq: ['$result', 'converted'] }, 1, 0] },
            },
          },
        },
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
            userId: '$user._id',
            fullName: '$user.fullName',
            email: '$user.email',
            totalCalls: 1,
            byResult: {
              answered: '$answered',
              missed: '$missed',
              callback: '$callback',
              converted: '$converted',
            },
            converted: '$converted',
          },
        },
      ]),

      // goal for current user (non-admin only)
      user.role === 'admin'
        ? null
        : Goal.findOne({
            userId: user.id,
            type: 'weekly_calls',
            startDate: { $lte: now.toDate() },
            endDate: { $gte: now.toDate() },
          }),

      // team telecaller count for admin/leader
      (async () => {
        if (user.role === 'telecaller') return 0;
        const match: any = { role: 'telecaller', active: true };
        if (user.role === 'leader') match.leaderId = user.id;
        const count = await User.countDocuments(match);
        return count;
      })(),
    ]);

    // 5) Format lead status breakdowns
    const statusBreakdown: any = {
      new: 0,
      in_progress: 0,
      callback: 0,
      closed: 0,
      dead: 0,
    };
    for (const row of leadStatusAgg) {
      statusBreakdown[row._id] = row.count;
    }

    const updatedStatusBreakdown: any = {
      new: 0,
      in_progress: 0,
      callback: 0,
      closed: 0,
      dead: 0,
    };
    for (const row of updatedInPeriodAgg) {
      updatedStatusBreakdown[row._id] = row.count;
    }

    // 6) Format call breakdown
    const callByResult: any = {
      answered: 0,
      missed: 0,
      callback: 0,
      converted: 0,
    };
    let totalCalls = 0;
    for (const row of callByResultAgg) {
      callByResult[row._id] = row.count;
      totalCalls += row.count;
    }

    // 7) Team stats (admin/leader)
    let teamStats: any = undefined;
    if (user.role !== 'telecaller') {
      const sortedTelecallers = [...callPerTelecallerAgg].sort(
        (a, b) => b.totalCalls - a.totalCalls
      );
      const topTelecallers = sortedTelecallers.slice(0, 5).map((t) => ({
        userId: t.userId,
        fullName: t.fullName,
        email: t.email,
        totalCalls: t.totalCalls,
        converted: t.converted,
      }));

      teamStats = {
        totalTelecallers: teamTelecallerCount,
        topTelecallers,
      };
    }

    // 8) Goal stats (telecaller / leader)
    let goalStats: any = undefined;
    if (goalDoc) {
      const remaining = Math.max(
        0,
        (goalDoc.target || 0) - (goalDoc.achieved || 0)
      );
      goalStats = {
        weeklyTarget: goalDoc.target,
        achieved: goalDoc.achieved,
        remaining,
      };
    }

    // 9) Build final response
    return res.json({
      range,
      period: {
        start,
        end,
      },
      role: user.role,

      leadStats: {
        totalLeads,
        statusBreakdown,
        createdInPeriod,
        startedInPeriod,
        updatedInPeriod: updatedInPeriodAgg.reduce(
          (sum: number, row: any) => sum + row.count,
          0
        ),
        updatedStatusBreakdown,
      },

      callStats: {
        totalCalls,
        byResult: callByResult,
        perTelecaller: callPerTelecallerAgg,
      },

      goalStats,
      teamStats,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      error: 'Dashboard fetch error',
      details: error.message,
    });
  }
};