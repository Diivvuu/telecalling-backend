import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/Users';

/**
 * 🔹 Get Team Members for the logged-in user
 * - Leader → sees self + their telecallers
 * - Telecaller → sees leader + all telecallers with same leaderId
 * - Admin → can view specific team via ?leaderId=<id>
 */
export const getTeamMembers = async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  // Optional for admin inspection
  const { leaderId } = req.query as { leaderId?: string };

  try {
    // 🔹 ADMIN MODE: view a specific team if leaderId provided
    if (user.role === 'admin' && leaderId) {
      const leader = await User.findById(leaderId)
        .select('-passwordHash')
        .lean();
      if (!leader || leader.role !== 'leader') {
        return res.status(404).json({ error: 'Leader not found' });
      }

      const members = await User.find({ leaderId: leader._id })
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .lean();

      return res.json({ leader, members });
    }

    // 🔹 LEADER MODE: self + telecallers under them
    if (user.role === 'leader') {
      const leader = await User.findById(user.id)
        .select('-passwordHash')
        .lean();

      const members = await User.find({ leaderId: user.id })
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .lean();

      return res.json({ leader, members });
    }

    // 🔹 TELECALLER MODE: same leader + peers + leader
    if (user.role === 'telecaller') {
      const leaderIdParam = leaderId || user.leaderId;
      if (!leaderIdParam) {
        return res.json({ leader: null, members: [] });
      }

      const leader = await User.findById(leaderIdParam)
        .select('-passwordHash')
        .lean();

      const members = await User.find({ leaderId: leaderIdParam })
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .lean();

      return res.json({ leader, members });
    }

    // 🔹 Admin without leaderId param = forbidden (explicit)
    return res
      .status(400)
      .json({ error: 'Admin must provide ?leaderId=<id> to view a team' });
  } catch (err) {
    console.error('Error fetching team members:', err);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
};
