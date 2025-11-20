import { Router } from 'express';
import { auth } from '../middleware/auth';
import { createCallLog, listCallLogs } from '../controllers/call.controller';

const router = Router();

router.post('/', auth(['admin', 'leader', 'telecaller']), createCallLog);
router.get('/', auth(['admin', 'leader', 'telecaller']), listCallLogs);

export default router;
