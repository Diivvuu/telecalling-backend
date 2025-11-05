import { Router } from 'express';
import { auth } from '../middleware/auth';
import { getDashboardSummary } from '../controllers/dashboard.controller';

const router = Router();

router.get(
  '/summary',
  auth(['admin', 'leader', 'telecaller']),
  getDashboardSummary
);

export default router;
