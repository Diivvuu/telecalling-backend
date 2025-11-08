import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Notification } from '../models/Notification';

export const listNotifications = async (req: AuthRequest, res: Response) => {
  const notifs = await Notification.find({ userId: req.user!.id })
    .sort({ createdAt: -1 })
    .limit(30);

  res.json(notifs);
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await Notification.findByIdAndUpdate(id, { read: true });
  res.json({ success: true });
};
