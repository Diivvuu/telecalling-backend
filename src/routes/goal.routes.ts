import { Router } from 'express';
import { createGoal, listGoals } from '../controllers/goal.controller';
import { auth } from '../middleware/auth';

const router = Router();

router.post('/', auth(['admin', 'leader', 'telecaller']), createGoal);
router.get('/', auth(['admin', 'leader', 'telecaller']), listGoals);

export default router;
