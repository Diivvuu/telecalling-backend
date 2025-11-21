import { Router } from 'express';
import {
  createLead,
  deleteLead,
  getLead,
  listLeads,
  updateLead,
  bulkUpdateLeads,
  bulkAssignLeads,
  updateLeadStatus,
  uploadLeadsUniversal, // 👈 add this import
} from '../controllers/lead.controller';
import { auth } from '../middleware/auth';
import { upload } from '../config/multer';

const r = Router();

r.post(
  '/upload-csv',
  auth(['admin']),
  upload.single('file'),
  uploadLeadsUniversal
);
r.post('/', auth(['admin']), createLead);
r.get('/', auth(['admin', 'leader', 'telecaller']), listLeads);
r.put('/:id', auth(['admin', 'leader', 'telecaller']), updateLead);
r.get('/:id', auth(['admin', 'leader', 'telecaller']), getLead);
r.delete('/:id', auth(['admin', 'leader', 'telecaller']), deleteLead);
r.put('/bulk', auth(['admin', 'leader']), bulkUpdateLeads); // 👈 new bulk endpoint
r.put('/bulk/assign', auth(['admin', 'leader']), bulkAssignLeads);
r.patch(
  '/:id/status',
  auth(['admin', 'leader', 'telecaller']),
  updateLeadStatus
);

export default r;
