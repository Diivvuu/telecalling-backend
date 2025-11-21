import { Router } from 'express';
import {
  createUser,
  deleteUser,
  getTelecallerCalls,
  getTelecallerDashboard,
  getTelecallerGoal,
  getTelecallerLeads,
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

router.get('/:userId/leads', auth(['admin', 'leader']), getTelecallerLeads);
router.get('/:userId/calls', auth(['admin', 'leader']), getTelecallerCalls);
router.get('/:userId/goals', auth(['admin', 'leader']), getTelecallerGoal);
router.get('/:userId/dashboard', auth(['admin', 'leader']), getTelecallerDashboard);

export default router;
