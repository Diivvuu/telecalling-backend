import { Router } from 'express';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from '../controllers/user.controller';
import { auth } from '../middleware/auth';

const router = Router();

router.get('/', auth(['admin', 'leader']), listUsers);
router.post('/', auth(['admin', 'leader']), createUser);
router.patch('/:id', auth(['admin']), updateUser);
router.get('/:id', auth(['admin', 'leader', 'telecaller']), getUser);
router.delete('/:id', auth(['admin', 'leader', 'telecaller']), deleteUser);

export default router;
