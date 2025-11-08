import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { Lead } from '../models/Lead';
import { User } from '../models/Users';
import { ActivityLog } from '../models/ActivityLog';

/* =======================================================
   CREATE LEAD
   ======================================================= */
export const createLead = async (req: AuthRequest, res: Response) => {
  const { name, phone, assignedTo, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Missing fields' });

  const existing = await Lead.findOne({ phone, active: true });
  if (existing) return res.status(409).json({ error: 'Lead already exists' });

  const user = req.user!;
  let leaderId: string | undefined;

  // Admin assigning to telecaller or leader
  if (user.role === 'admin' && assignedTo) {
    const target = await User.findById(assignedTo);
    if (!target) return res.status(400).json({ error: 'Invalid assignee' });
    if (target.role === 'telecaller' && target.leaderId)
      leaderId = target.leaderId.toString();
    else if (target.role === 'leader') leaderId = target.id;
  }

  // Leader assigning within their team
  if (user.role === 'leader' && assignedTo) {
    const target = await User.findById(assignedTo);
    if (
      !target ||
      target.role !== 'telecaller' ||
      String(target.leaderId) !== user.id
    ) {
      return res.status(403).json({ error: 'Cannot assign outside your team' });
    }
    leaderId = user.id;
  }

  // Telecaller self-only
  if (user.role === 'telecaller') {
    if (assignedTo && assignedTo !== user.id)
      return res
        .status(403)
        .json({ error: 'Telecaller cannot assign leads to others' });
    leaderId = user.leaderId ? String(user.leaderId) : undefined;
  }

  const lead = await Lead.create({
    name,
    phone,
    notes,
    assignedTo: assignedTo ? new Types.ObjectId(assignedTo) : null,
    leaderId,
    createdBy: user.id,
  });

  await ActivityLog.create({
    userId: user.id,
    action: 'CREATE_LEAD',
    targetId: lead._id,
  });

  res.status(201).json(lead);
};

/* =======================================================
   LIST LEADS
   ======================================================= */
export const listLeads = async (req: AuthRequest, res: Response) => {
  const {
    page = '1',
    pageSize = '20',
    status,
    search,
  } = req.query as Record<string, string>;

  const p = Math.max(parseInt(page), 1);
  const ps = Math.min(Math.max(parseInt(pageSize), 1), 100);
  const user = req.user!;
  const filter: any = {};

  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];
  }

  if (user.role === 'telecaller') {
    // only their own leads
    filter.assignedTo = user.id;
  } else if (user.role === 'leader') {
    // 🔹 find telecallers under this leader
    const telecallerIds = await User.find(
      { leaderId: user.id, role: 'telecaller', active: true },
      '_id'
    ).lean();

    // 🔹 include leads unassigned or assigned to those telecallers
    filter.$or = [
      { assignedTo: { $in: telecallerIds.map((t) => t._id) } },
      { assignedTo: { $exists: false } },
      { assignedTo: null },
    ];
  }
  // admin gets all leads, so no special filter

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .select(
        'name phone status notes assignedTo leaderId createdAt lastCallAt callCount nextCallDate source active'
      )
      .populate('assignedTo', 'email fullName role')
      .populate('leaderId', 'email fullName role')
      .sort({ createdAt: -1 })
      .skip((p - 1) * ps)
      .limit(ps),
    Lead.countDocuments(filter),
  ]);

  res.json({ items, total, page: p, pageSize: ps });
};

/* =======================================================
   UPDATE LEAD
   ======================================================= */
export const updateLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, phone, status, notes, nextCallDate, assignedTo, unassign } =
    req.body;

  const lead = await Lead.findById(id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const user = req.user!;

  // perms: same as before…

  // ✅ Reassign / Unassign logic
  if (
    ['admin', 'leader'].includes(user.role) &&
    (unassign === true || assignedTo)
  ) {
    if (unassign === true) {
      // make it unattended
      lead.assignedTo = null;
      // clear leader linkage when unassigned
      // use $unset equivalent on save:
      (lead as any).leaderId = undefined;
    } else if (assignedTo) {
      const target = await User.findById(assignedTo);
      if (!target)
        return res.status(400).json({ error: 'Invalid assignee selected' });

      if (user.role === 'leader') {
        if (
          target.role !== 'telecaller' ||
          String(target.leaderId) !== user.id
        ) {
          return res
            .status(403)
            .json({ error: 'Cannot assign outside your team' });
        }
        lead.assignedTo = new Types.ObjectId(assignedTo);
        lead.leaderId = new Types.ObjectId(user.id);
      } else if (user.role === 'admin') {
        lead.assignedTo = new Types.ObjectId(assignedTo);
        if (target.role === 'telecaller' && target.leaderId) {
          lead.leaderId = new Types.ObjectId(target.leaderId);
        } else if (target.role === 'leader') {
          lead.leaderId = new Types.ObjectId(target.id);
        } else {
          (lead as any).leaderId = undefined;
        }
      }
    }
  }

  // rest unchanged…
  // if (status) lead.status = status;
  if (notes) lead.notes = notes;
  if (nextCallDate) lead.nextCallDate = new Date(nextCallDate);
  if (name) lead.name = name;
  if (phone) lead.phone = phone;

  lead.callCount += 1;
  lead.lastCallAt = new Date();
  lead.updatedBy = user.id;
  await lead.save();

  await ActivityLog.create({
    userId: user.id,
    action: 'UPDATE_LEAD',
    targetId: lead._id,
    meta: { changes: { assignedTo, unassign: !!unassign, notes } },
  });

  res.json(lead);
};

/* =======================================================
   GET SINGLE LEAD
   ======================================================= */
export const getLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const lead = await Lead.findById(id)
    .populate('assignedTo', 'id fullName email role')
    .populate('leaderId', 'id fullName email role')
    .populate('createdBy', 'id fullName email role');

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const user = req.user!;
  if (user.role === 'admin') return res.json(lead);
  if (user.role === 'telecaller' && String(lead.assignedTo) === user.id)
    return res.json(lead);
  if (user.role === 'leader' && String(lead.leaderId) === user.id)
    return res.json(lead);

  return res.status(403).json({ error: 'Forbidden: not your lead' });
};

/* =======================================================
   DELETE LEAD
   ======================================================= */
export const deleteLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const lead = await Lead.findById(id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (user.role === 'telecaller' && String(lead.createdBy) !== user.id)
    return res.status(403).json({ error: 'You can delete only your leads' });
  if (user.role === 'leader' && String(lead.leaderId) !== user.id)
    return res
      .status(403)
      .json({ error: "You can delete only your team's leads" });

  await Lead.findByIdAndDelete(id);
  await ActivityLog.create({
    userId: user.id,
    action: 'DELETE_LEAD',
    targetId: id,
  });

  res.json({ success: true, message: 'Lead deleted successfully' });
};

/* =======================================================
   BULK UPDATE LEADS
   ======================================================= */
export const bulkUpdateLeads = async (req: AuthRequest, res: Response) => {
  const { ids, status } = req.body;
  const user = req.user!;

  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'No leads selected' });
  if (!status) return res.status(400).json({ error: 'Status is required' });

  if (!['admin', 'leader'].includes(user.role))
    return res
      .status(403)
      .json({ error: 'Only admin or leader can perform bulk updates' });

  const filter: any = { _id: { $in: ids } };
  if (user.role === 'leader') filter.leaderId = user.id;

  const result = await Lead.updateMany(filter, {
    $set: {
      status,
      updatedBy: user.id,
      lastCallAt: new Date(),
    },
  });

  await ActivityLog.create({
    userId: user.id,
    action: 'BULK_UPDATE_LEADS',
    meta: { ids, status },
  });

  res.json({
    success: true,
    updatedCount: result.modifiedCount,
    message: `Updated ${result.modifiedCount} leads to "${status}"`,
  });
};

/* =======================================================
   BULK ASSIGN LEADS
   ======================================================= */
export const bulkAssignLeads = async (req: AuthRequest, res: Response) => {
  const { ids, leaderId, assignedTo, unassign } = req.body;
  const user = req.user!;

  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ error: 'No leads selected' });

  if (!unassign && !leaderId && !assignedTo)
    // ← allow when unassign is true
    return res
      .status(400)
      .json({ error: 'leaderId, assignedTo or unassign is required' });

  if (!['admin', 'leader'].includes(user.role))
    return res
      .status(403)
      .json({ error: 'Only admin or leader can perform bulk assignments' });

  const filter: any = { _id: { $in: ids } };
  if (user.role === 'leader') filter.leaderId = user.id;

  const updateOp: any = {
    $set: { updatedBy: user.id, lastCallAt: new Date() },
  };

  if (unassign === true) {
    updateOp.$set.assignedTo = null;
    updateOp.$unset = { leaderId: '' }; // ← clear leader linkage
  } else {
    if (leaderId) {
      const validLeader = await User.findOne({ _id: leaderId, role: 'leader' });
      if (!validLeader)
        return res.status(400).json({ error: 'Invalid leader selected' });
      updateOp.$set.leaderId = leaderId;
    }
    if (assignedTo) {
      const tele = await User.findOne({
        _id: assignedTo,
        role: 'telecaller',
        active: true,
      });
      if (!tele)
        return res.status(400).json({ error: 'Invalid telecaller selected' });
      if (user.role === 'leader' && String(tele.leaderId) !== user.id)
        return res
          .status(403)
          .json({ error: 'Cannot assign telecaller outside your team' });

      updateOp.$set.assignedTo = assignedTo;
      if (tele.leaderId) updateOp.$set.leaderId = tele.leaderId;
    }
  }

  const result = await Lead.updateMany(filter, updateOp);

  await ActivityLog.create({
    userId: user.id,
    action: 'BULK_ASSIGN_LEADS',
    meta: { ids, leaderId, assignedTo, unassign: !!unassign },
  });

  res.json({
    success: true,
    updatedCount: result.modifiedCount,
    message: unassign
      ? `Unassigned ${result.modifiedCount} lead(s)`
      : `Assigned ${result.modifiedCount} lead(s) successfully`,
  });
};

/* =======================================================
   UPDATE LEAD STATUS (Dedicated)
   ======================================================= */
export const updateLeadStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, notes, nextCallDate } = req.body;
  const user = req.user!;

  if (!status) return res.status(400).json({ error: 'Status is required' });

  const validStatuses = ['new', 'in_progress', 'callback', 'closed', 'dead'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: 'Invalid status value' });

  const lead = await Lead.findById(id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  // --- Role validation
  if (user.role === 'telecaller' && String(lead.assignedTo) !== user.id)
    return res
      .status(403)
      .json({ error: 'Not authorized to modify this lead' });
  if (user.role === 'leader' && String(lead.leaderId) !== user.id)
    return res
      .status(403)
      .json({ error: 'Not authorized to modify this lead' });

  // --- Status update
  lead.status = status;
  if (notes) lead.notes = notes;
  if (nextCallDate) lead.nextCallDate = new Date(nextCallDate);
  lead.callCount += 1;
  lead.lastCallAt = new Date();
  lead.updatedBy = user.id;

  await lead.save();

  await ActivityLog.create({
    userId: user.id,
    action: 'UPDATE_LEAD_STATUS',
    targetId: lead._id,
    meta: { status, notes, nextCallDate },
  });

  res.json({ success: true, lead });
};
