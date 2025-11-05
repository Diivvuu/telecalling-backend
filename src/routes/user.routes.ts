import { Router } from 'express';
import {
  createUser,
  getUser,
  listUsers,
  updateUser,
} from '../controllers/user.controller';
import { auth } from '../middleware/auth';

const router = Router();

router.get('/', auth(['admin', 'leader']), listUsers);
router.post('/', auth(['admin']), createUser);
router.patch('/:id', auth(['admin']), updateUser);
router.get('/:id', auth(['admin', 'leader', 'telecaller']), getUser);

export default router;
