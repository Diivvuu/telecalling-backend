import { Router } from 'express';
import { auth } from '../middleware/auth';
import {
  listNotifications,
  markAsRead,
} from '../controllers/notification.controller';

const router = Router();

router.get('/', auth(['admin', 'leader', 'telecaller']), listNotifications);
router.patch('/:id/read', auth(['admin', 'leader', 'telecaller']), markAsRead);

export default router;
