import { Router } from 'express';
import {
  createLead,
  getLead,
  listLeads,
  updateLead,
} from '../controllers/lead.controller';
import { auth } from '../middleware/auth';

const r = Router();
// r.use(require)

r.post('/', auth(['admin', 'leader', 'telecaller']), createLead);
r.get('/', auth(['admin', 'leader', 'telecaller']), listLeads);
r.put('/:id', auth(['admin', 'leader', 'telecaller']), updateLead);
r.get('/:id', auth(['admin', 'leader', 'telecaller']), getLead);

export default r;
