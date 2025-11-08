import { Document, model, Schema } from 'mongoose';

export interface IActivityLog extends Document {
  userId: Schema.Types.ObjectId;
  action: string;
  targetId?: Schema.Types.ObjectId;
  meta?: Record<string, any>;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId },
    meta: { type: Object },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

export const ActivityLog = model<IActivityLog>('ActivityLog', activityLogSchema)