import { Document, model, Schema, Types } from 'mongoose';

export interface ILead extends Document {
  name: string;
  phone: string;
  status: 'new' | 'in_progress' | 'callback' | 'closed' | 'dead';
  notes?: string;
  assignedTo?: Types.ObjectId | null;
  leaderId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | string;
  nextCallDate?: Date;
  callCount: number;
  lastCallAt?: Date;
  source?: string;
  active: boolean;
}

const leadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    status: {
      type: String,
      enum: ['new', 'in_progress', 'callback', 'closed', 'dead'],
      default: 'new',
    },
    notes: String,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default : null },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    nextCallDate: Date,
    callCount: { type: Number, default: 0 },
    lastCallAt: Date,
    source: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

leadSchema.index({ assignedTo: 1 });
leadSchema.index({ leaderId: 1 });
leadSchema.index({ status: 1 });

export const Lead = model<ILead>('Lead', leadSchema);
