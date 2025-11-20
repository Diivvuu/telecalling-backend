import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { Lead } from '../models/Lead';
import { User } from '../models/Users';
import { ActivityLog } from '../models/ActivityLog';

/* =======================================================
   CREATE LEAD (ADMIN ONLY)
   ======================================================= */
export const createLead = async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { name, phone, behaviour, assignedTo, notes } = req.body;

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can create leads' });
  }

  if (!name || !phone) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const existing = await Lead.findOne({ phone, active: true });
  if (existing) {
    return res.status(409).json({ error: 'Lead already exists' });
  }

  let leaderId: string | undefined;

  if (assignedTo) {
    const target = await User.findById(assignedTo);
    if (!target) {
      return res.status(400).json({ error: 'Invalid assignee' });
    }

    if (target.role === 'telecaller' && target.leaderId) {
      leaderId = target.leaderId.toString();
    } else if (target.role === 'leader') {
      leaderId = target.id;
    }
  }

  const lead = await Lead.create({
    name,
    phone,
    behaviour,
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
   - Admin: all leads (allocated + unallocated)
   - Leader: all allocated leads (assignedTo != null) + ownLead flag
   - Telecaller: only leads assigned to them
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

  if (status) {
    filter.status = status;
  }

  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];
  }

  if (user.role === 'telecaller') {
    // Only their own leads
    filter.assignedTo = user.id;
  } else if (user.role === 'leader') {
    // Leader sees all allocated leads (assignedTo != null)
    filter.assignedTo = { $ne: null };
  }
  // Admin: all leads, no extra filter

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .select(
        'name phone status behaviour notes assignedTo leaderId createdAt updatedAt lastCallAt callCount nextCallDate source active'
      )
      .populate('assignedTo', 'email fullName role')
      .populate('leaderId', 'email fullName role')
      .sort({ createdAt: -1 })
      .skip((p - 1) * ps)
      .limit(ps)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  // Add ownLead flag for leaders (true if this lead belongs to their team)
  if (user.role === 'leader') {
    items.forEach((lead: any) => {
      lead.ownLead = lead.leaderId?.toString() === user.id;
    });
  }

  res.json({ items, total, page: p, pageSize: ps });
};

/* =======================================================
   UPDATE LEAD (Admin edits + Admin-only allocation)
   ======================================================= */
export const updateLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    name,
    phone,
    behaviour,
    status, // still not used/updatable here – kept for future if needed
    notes,
    nextCallDate,
    assignedTo,
    unassign,
  } = req.body;

  const user = req.user!;
  const lead = await Lead.findById(id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  // Only admin can assign/unassign
  // if ((assignedTo || unassign) && user.role !== 'admin') {
  //   return res.status(403).json({ error: 'Only admin can allocate leads' });
  // }

  // ✅ Reassign / Unassign logic (ADMIN ONLY)
  if (user.role === 'admin' && (unassign === true || assignedTo)) {
    if (unassign === true) {
      // make it unattended
      lead.assignedTo = null;
      (lead as any).leaderId = undefined;
    } else if (assignedTo) {
      const target = await User.findById(assignedTo);
      if (!target) {
        return res.status(400).json({ error: 'Invalid assignee selected' });
      }

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

  // rest unchanged (except behaviour)
  // if (status) lead.status = status;  // status change handled only in dedicated status APIs

  if (name) lead.name = name;
  if (phone) lead.phone = phone;
  if (behaviour) lead.behaviour = behaviour;
  if (notes) lead.notes = notes;
  if (nextCallDate) lead.nextCallDate = new Date(nextCallDate);

  // lead.callCount += 1;
  // lead.lastCallAt = new Date();
  lead.updatedBy = user.id;

  await lead.save();

  await ActivityLog.create({
    userId: user.id,
    action: 'UPDATE_LEAD',
    targetId: lead._id,
    meta: {
      changes: {
        assignedTo: assignedTo || null,
        unassign: !!unassign,
        behaviour,
        notes,
      },
    },
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
   (kept close to your original logic; admin strongest)
   ======================================================= */
export const deleteLead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const lead = await Lead.findById(id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  // If you want only admin, uncomment this and remove others:
  // if (user.role !== 'admin') {
  //   return res.status(403).json({ error: 'Only admin can delete leads' });
  // }

  if (user.role === 'telecaller' && String(lead.createdBy) !== user.id)
    return res.status(403).json({ error: 'You can delete only your leads' });

  if (user.role === 'leader' && String(lead.leaderId) !== user.id)
    return res
      .status(403)
      .json({ error: "You can delete only your team's leads" });

  // admin can delete anything
  await Lead.findByIdAndDelete(id);

  await ActivityLog.create({
    userId: user.id,
    action: 'DELETE_LEAD',
    targetId: id,
  });

  res.json({ success: true, message: 'Lead deleted successfully' });
};

/* =======================================================
   BULK UPDATE LEADS (STATUS) 
   - Admin & Leader allowed
   - Prevent revert to 'new'
   - Goal count increment only once (new -> anything)
   ======================================================= */
export const bulkUpdateLeads = async (req: AuthRequest, res: Response) => {
  const { ids, status } = req.body;
  const user = req.user!;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No leads selected' });
  }
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const validStatuses = ['new', 'in_progress', 'callback', 'closed', 'dead'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  if (!['admin', 'leader'].includes(user.role)) {
    return res
      .status(403)
      .json({ error: 'Only admin or leader can perform bulk updates' });
  }

  const filter: any = { _id: { $in: ids } };
  if (user.role === 'leader') {
    filter.leaderId = user.id;
  }

  const existingLeads = await Lead.find(filter).select('status').lean();

  // Prevent reverting any non-new lead back to new
  if (status === 'new') {
    const hasNonNew = existingLeads.some((l) => l.status !== 'new');
    if (hasNonNew) {
      return res.status(400).json({
        error: 'Cannot change status back to new for one or more leads',
      });
    }
  }

  // Goal / callCount increment ONCE for new -> not new
  if (status !== 'new') {
    await Lead.updateMany(
      { _id: { $in: ids }, status: 'new' },
      {
        $inc: { callCount: 1 },
        $set: { lastCallAt: new Date() },
      }
    );
  }

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
   BULK ASSIGN LEADS (ADMIN ONLY – allocation)
   ======================================================= */
export const bulkAssignLeads = async (req: AuthRequest, res: Response) => {
  const { ids, leaderId, assignedTo, unassign } = req.body;
  const user = req.user!;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No leads selected' });
  }

  if (!unassign && !leaderId && !assignedTo) {
    return res
      .status(400)
      .json({ error: 'leaderId, assignedTo or unassign is required' });
  }

  if (user.role !== 'admin') {
    return res
      .status(403)
      .json({ error: 'Only admin can perform bulk assignments' });
  }

  const filter: any = { _id: { $in: ids } };

  const updateOp: any = {
    $set: { updatedBy: user.id, lastCallAt: new Date() },
  };

  if (unassign === true) {
    updateOp.$set.assignedTo = null;
    updateOp.$unset = { leaderId: '' };
  } else {
    if (leaderId) {
      const validLeader = await User.findOne({ _id: leaderId, role: 'leader' });
      if (!validLeader) {
        return res.status(400).json({ error: 'Invalid leader selected' });
      }
      updateOp.$set.leaderId = leaderId;
    }

    if (assignedTo) {
      const tele = await User.findOne({
        _id: assignedTo,
        active: true,
      });
      if (!tele) {
        return res.status(400).json({ error: 'Invalid telecaller selected' });
      }
      if (tele.role !== 'telecaller') {
        return res
          .status(400)
          .json({ error: 'Assigned user must be a telecaller' });
      }

      updateOp.$set.assignedTo = assignedTo;
      if (tele.leaderId) {
        updateOp.$set.leaderId = tele.leaderId;
      }
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
   - respects role visibility
   - cannot revert to 'new'
   - goal/callCount incremented only once (new -> anything)
   ======================================================= */
export const updateLeadStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, notes, nextCallDate, behaviour } = req.body;
  const user = req.user!;

  if (!status) return res.status(400).json({ error: 'Status is required' });

  const validStatuses = ['new', 'in_progress', 'callback', 'closed', 'dead'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

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

  // --- Prevent reverting status back to 'new'
  if (lead.status !== 'new' && status === 'new') {
    return res.status(400).json({
      error: 'Status cannot be changed back to new once updated',
    });
  }

  // --- Goal / callCount increment ONCE when status changes from new -> anything
  if (lead.status === 'new' && status !== 'new') {
    lead.callCount += 1;
    lead.lastCallAt = new Date();
    // 🔔 Place to hook goal update if you have a goal model
  }

  // --- Apply status + other fields
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