import { Router } from 'express';
import { auth } from '../middleware/auth';
import { ActivityLog } from '../models/ActivityLog';

const router = Router();

router.get('/', auth(['admin', 'leader', 'telecaller']), async (req, res) => {
  const logs = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('userId', 'fullName email role');
  res.json(logs);
});

export default router;
