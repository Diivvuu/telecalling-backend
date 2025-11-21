import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Lead } from '../models/Lead';
import { User } from '../models/Users';
import { Types } from 'mongoose';
import { ActivityLog } from '../models/ActivityLog';
import { Goal } from '../models/Goal';
import xlsx from 'xlsx';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

export const createLead = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { name, phone, behaviour, assignedTo, notes, source } = req.body;
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can create leads' });
  }

  if (!phone) return res.status(400).json({ error: 'Missing required fields' });

  const existing = await Lead.findOne({ phone, active: true });
  if (existing) return res.status(409).json({ error: 'Lead already exists' });

  let leaderId: string | undefined = undefined;
  if (assignedTo) {
    const target = await User.findById(assignedTo);
    if (!target) return res.status(400).json({ error: 'Invalid assignee' });
    leaderId = target.role === 'leader' ? target.id : target.leaderId;
  }

  const lead = await Lead.create({
    name,
    phone,
    behaviour,
    notes,
    assignedTo: assignedTo ? new Types.ObjectId(assignedTo) : null,
    leaderId,
    source,
    createdBy: user.id,
  });

  // await ActivityLog.create({userId : user.id, action : 'CREATE_LEAD', targetId : leaed})
  res.status(201).json(lead);
};

export const getLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const lead = await Lead.findById(id)
    .populate('assignedTo', 'fullName email role')
    .populate('leaderId', 'fullName email role')
    .populate('createdBy', 'fullName email role')
    .populate('updatedBy', 'fullName email role')
    .lean();

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  //permission check
  if (
    user.role == 'admin' ||
    (user.role === 'telecaller' && String(lead.assignedTo?._id) === user.id) ||
    (user.role === 'leader' && String(lead.leaderId?._id) === user.id)
  ) {
    return res.json(lead);
  }

  return res
    .status(403)
    .json({ error: 'Forbidden : not authorized to view this lead' });
};

export const listLeads = async (req: AuthRequest, res: Response) => {
  const {
    page = '1',
    pageSize = '20',
    status,
    search,
    view = 'all',
  } = req.query as Record<string, string>;
  const p = Math.max(parseInt(page), 1);
  const ps = Math.min(Math.max(parseInt(pageSize), 1), 100);

  const user = req.user!;
  const filter: any = {};

  if (status) filter.status = status;
  if (search)
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];

  if (user.role === 'telecaller') {
    filter.assignedTo = user.id;
  } else if (user.role === 'leader') {
    if (view === 'own') {
      filter.leaderId = user.id;
    }
  }

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .select(
        'name phone status behaviour notes assignedTo leaderId source createdAt updatedAt lastCallAt callCount nextCallDate'
      )
      .populate('assignedTo', 'fullName email role')
      .populate('leaderId', 'fullName email role')
      .sort({ createdAt: -1 })
      .skip((p - 1) * ps)
      .limit(ps)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  // if (user.role === 'leader') {
  //   items.forEach((lead : any) => lead.ownLead = lead.leaderId?.toISOString)
  // }
  res.json({ items, total, page: p, pageSize, ps });
};

export const updateLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, phone, behaviour, notes, nextCallDate, source } = req.body;
  const user = req.user!;
  const lead = await Lead.findById(id);

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (user.role === 'admin') {
    if (name) lead.name = name;
    if (phone) lead.phone = phone;
    if (behaviour) lead.behaviour = behaviour;
    if (notes) lead.notes = notes;
    if (source) lead.source = source;
    if (nextCallDate) lead.nextCallDate = new Date(nextCallDate);
  }

  if (['leader', 'telecaller'].includes(user.role)) {
    if (behaviour) lead.behaviour = behaviour;
    if (notes) lead.notes = notes;
    if (nextCallDate) lead.nextCallDate = new Date(nextCallDate);
  }

  lead.updatedBy = user.id;
  await lead.save();

  await ActivityLog.create({
    userId: user.id,
    action: 'UPDATE_LEAD',
    targetId: lead._id,
    meta: { behaviour, notes, nextCallDate },
  });

  res.json(lead);
};

export const deleteLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const lead = await Lead.findById(id);

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can delete leads' });
  }

  await lead.deleteOne();
  await ActivityLog.create({
    userId: user.id,
    action: 'DELETE_LEAD',
    targetId: id,
  });

  res.json({ success: true, message: 'Lead deleted successfully' });
};

export const updateLeadStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, notes, nextCallDate, behaviour } = req.body;
  const user = req.user!;

  if (!status) return res.status(400).json({ error: 'Status is required' });

  const lead = await Lead.findById(id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (lead.status !== 'new' && status === 'new') {
    return res.status(400).json({ error: 'Cannot revert status back to new' });
  }

  if (lead.status === 'new' && status !== 'new') {
    lead.callCount += 1;
    lead.lastCallAt = new Date();

    await Goal.findOneAndUpdate(
      {
        userId: user.id,
        type: 'weekly_calls',
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
      },
      { $inc: { achieved: 1 } }
    );
  }

  lead.status = status;
  if (behaviour) lead.behaviour = behaviour;
  if (notes) lead.notes = notes;
  if (nextCallDate) lead.nextCallDate = new Date(nextCallDate);
  lead.updatedBy = user.id;

  await lead.save();

  await ActivityLog.create({
    userId: user.id,
    action: 'UPDATE_LEAD_STATUS',
    targetId: lead._id,
    meta: { status, notes, behaviour, nextCallDate },
  });

  res.json({ success: true, lead });
};

export const bulkUpdateLeads = async (req: AuthRequest, res: Response) => {
  const { ids, status } = req.body;
  const user = req.user!;

  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'No leads selected' });

  if (!status) return res.status(400).json({ error: 'Status is required' });

  const leads = await Lead.find({ _id: { $in: ids } });
  for (const lead of leads) {
    if (lead.status === 'new' && status !== 'new') {
      lead.callCount += 1;
      lead.lastCallAt = new Date();
      await Goal.findOneAndUpdate(
        {
          userId: user.id,
          type: 'weekly_calls',
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() },
        },
        { $inc: { achieved: 1 } }
      );
    }
    lead.status = status;
    lead.updatedBy = user.id;
    await lead.save();
  }

  await ActivityLog.create({
    userId: user.id,
    action: 'BULK_UPDATE_STATUS',
    meta: { ids, status },
  });

  res.json({ success: true, updatedCount: ids.length });
};

//bulk assign leads
export const bulkAssignLeads = async (req: AuthRequest, res: Response) => {
  const { ids, assignedTo } = req.body;
  const user = req.user!;

  if (user.role !== 'admin')
    return res.status(403).json({ error: 'Only admin can assign leads' });

  const target = assignedTo ? await User.findById(assignedTo) : null;
  if (!target) return res.status(400).json({ error: 'Invalid assignee' });

  await Lead.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        assignedTo: assignedTo,
        leaderId: target.role === 'leader' ? target.id : target.leaderId,
        updatedBy: user.id,
      },
    }
  );

  await ActivityLog.create({
    userId: user.id,
    action: 'BULK_ASSIGN_LEADS',
    meta: { ids, assignedTo },
  });

  res.json({ success: true, updatedCount: ids.length });
};

export const uploadLeadsUniversal = async (req: AuthRequest, res: Response) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can upload leads' });
  }

  if (!req.file) return res.status(400).json({ error: 'File required' });

  const leadsToInsert: any[] = [];
  const errors: any[] = [];

  let rows: any[] = [];

  try {
    const fileExt = req.file.originalname.toLowerCase();

    const isExcel =
      fileExt.endsWith('.xls') ||
      fileExt.endsWith('.xlsx') ||
      req.file.mimetype.includes('excel') ||
      req.file.mimetype.includes('spreadsheet');

    const isCSV =
      fileExt.endsWith('.csv') ||
      req.file.mimetype.includes('text') ||
      req.file.mimetype.includes('csv') ||
      req.file.mimetype === 'application/octet-stream'; // Mac Numbers sometimes uses this
    if (isExcel) {
      const workbook = xlsx.read(req.file.buffer, {
        type: 'buffer',
        cellText: false,
        cellDates: false,
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    } else if (isCSV) {
      const bufferStream = Readable.from(req.file.buffer).pipe(csvParser());
      for await (const row of bufferStream) rows.push(row);
    } else {
      return res.status(400).json({
        error:
          'Unsupported file format. Use CSV or Excel export from any software.',
        detectedType: req.file.mimetype,
        originalFile: req.file.originalname,
      });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read file', detail: e });
  }

  // Process rows
  for (const rawRow of rows) {
    try {
      // Normalize column names
      const row: any = {};
      Object.keys(rawRow).forEach((key) => {
        if (!key) return;
        row[
          key
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
        ] = rawRow[key];
      });

      const values = Object.values(rawRow).filter((v) => v !== '');

      const mobile =
        row.mobile_number ||
        row.phone ||
        row.mobile ||
        row.contact ||
        (values.length >= 3 ? values[2] : null);

      const name = row.name || values?.[1];
      const source = row.source || values?.[3] || 'Unknown';
      const executive_email =
        row.executive_email || row.executive || values?.[4];

      if (!mobile) throw 'Mobile number missing';
      if (!executive_email) throw 'Executive email missing';

      // Convert number → string format
      const formattedMobile = String(mobile).trim();
      if (!/^\d{6,}$/.test(formattedMobile))
        throw 'Invalid mobile number format';

      // Check if lead already exists
      const existing = await Lead.findOne({
        phone: formattedMobile,
        active: true,
      });
      if (existing) throw 'Lead already exists';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(executive_email.trim())) {
        throw `Invalid email format: ${executive_email}`;
      }

      const assignedUser = await User.findOne({
        email: executive_email.trim(),
      });
      if (!assignedUser) throw `No user found: ${executive_email}`;

      leadsToInsert.push({
        name: name || 'Unnamed',
        phone: formattedMobile,
        source,
        assignedTo: assignedUser._id,
        leaderId:
          assignedUser.role === 'leader'
            ? assignedUser._id
            : assignedUser.leaderId,
        createdBy: req.user.id,
      });
    } catch (error) {
      errors.push({ row: rawRow, error });
    }
  }

  if (leadsToInsert.length > 0) await Lead.insertMany(leadsToInsert);

  res.json({
    success: true,
    inserted: leadsToInsert.length,
    failed: errors.length,
    errors,
  });
};
