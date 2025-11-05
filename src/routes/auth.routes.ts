import { Router } from 'express';
import { getMe, login } from '../controllers/auth.controller';
import { auth } from '../middleware/auth';

const router = Router();
router.post('/login', login);

router.get('/me', auth(['admin', 'leader', 'telecaller']), getMe)

export default router;
