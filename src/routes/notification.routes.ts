import express from 'express';
import {
  listNotifications,
  markAsRead,
} from '../controllers/notification.controller';
import { auth } from '../middleware/auth';

const router = express.Router();

router.get('/', auth(['admin', 'leader', 'telecaller']), listNotifications);
router.patch('/:id/read', auth(['admin', 'leader', 'telecaller']), markAsRead);

export default router;
