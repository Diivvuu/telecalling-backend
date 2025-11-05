import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Lead } from '../models/Lead';
import { User } from '../models/Users';

// POST LEAD
export const createLead = async (req: AuthRequest, res: Response) => {
  const { name, phone, assignedTo, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Missing fields' });

  const existing = await Lead.findOne({ phone, active: true });
  if (existing) return res.status(409).json({ error: 'Lead already exists' });

  const assignee = assignedTo || req.user!.id;
  const validAssignee = await User.exists({ _id: assignee });
  if (!validAssignee)
    return res.status(400).json({ error: 'Invalid assigned user' });

  if (
    req.user!.role === 'telecaller' &&
    assignedTo &&
    assignedTo !== req.user!.id
  ) {
    return res
      .status(403)
      .json({ error: 'Telelcaller cannot assign leads to others' });
  }

  const lead = await Lead.create({
    name,
    phone,
    notes,
    assignedTo:
      req.user!.role === 'telecaller'
        ? req.user!.id
        : assignedTo || req.user!.id,
    leaderId:
      req.user!.role === 'leader'
        ? req.user!.id
        : req.user!.role === 'telecaller'
        ? req.user!.leaderId
        : undefined,

    createdBy: req.user!.id,
  });

  res.status(201).json(lead);
};

// GET LEADS
export const listLeads = async (req: AuthRequest, res: Response) => {
  const {
    page = '1',
    pageSize = '20',
    status,
    search,
  } = req.query as Record<string, string>;
  const p = Math.max(parseInt(page), 1);
  const ps = Math.min(Math.max(parseInt(pageSize), 1), 100);

  const filter: any = {};

  if (status) filter.status = status;
  if (search)
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];

  if (req.user!.role === 'telecaller') {
    filter.assignedTo = req.user.id;
  } else if (req.user!.role === 'leader') {
    filter.leaderId = req.user!.id;
  }

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .select('name phone status notes assignedTo leaderId createdAt')
      .populate('assignedTo', 'email role')
      .sort({ createdAt: -1 })
      .skip((p - 1) * ps)
      .limit(ps),
    Lead.countDocuments(filter),
  ]);

  res.json({ items, total, page: p, pageSize: ps });
};

//UPDATE LEAD
export const updateLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, phone, status, notes, nextCallDate, assignedTo } = req.body;

  const lead = await Lead.findById(id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const user = req.user!;

  if (user.role === 'telecaller' && String(lead.createdBy) !== user.id) {
    return res
      .status(403)
      .json({ error: 'You can only edit leads you created yourself' });
  }

  if (user.role === 'telecaller' && (assignedTo || phone || name)) {
    if (String(lead.createdBy) === user.id) {
      if (name) lead.name = name;
      if (phone) lead.phone = phone;
    } else {
      return res
        .status(403)
        .json({ error: 'You cannot change details of this lead' });
    }
  }

  //leader modily only their team's leads
  if (user.role === 'leader' && String(lead.leaderId) !== user.id) {
    return res.status(403).json({ error: 'Not authorized for this lead' });
  }

  // admin can edit anything
  if (status) lead.status = status;
  if (notes) lead.notes = notes;
  if (nextCallDate) lead.nextCallDate = new Date(nextCallDate);

  // admin or leader can re assign
  if (['admin', 'leader'].includes(user.role) && assignedTo) {
    lead.assignedTo = assignedTo;
  }

  lead.callCount += 1;
  lead.lastCallAt = new Date();
  lead.updatedBy = user.id;
  await lead.save();

  res.json(lead);
};

// GET LEAd
export const getLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const lead = await Lead.findById(id)
    .populate('assignedTo', 'id name email role')
    .populate('leaderId', 'id name email role')
    .populate('createdBy', 'id name email role');

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const user = req.user!;

  if (user.role === 'admin') return res.json(lead);
  if (user.role === 'telecaller' && String(lead.assignedTo) === user.id)
    return res.json(lead);
  if (user.role === 'leader' && String(lead.leaderId) === user.id)
    return res.json(lead);

  return res.status(403).json({ error: 'Forbidden : not your lead' });
};
