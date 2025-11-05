import { Document, model, Schema } from 'mongoose';

export interface ILead extends Document {
  name: string;
  phone: string;
  status: 'new' | 'in_progress' | 'callback' | 'closed' | 'dead';
  notes?: string;
  assignedTo: Schema.Types.ObjectId;
  leaderId?: Schema.Types.ObjectId;
  createdBy: Schema.Types.ObjectId;
  updatedBy?: Schema.Types.ObjectId | string;
  nextCallDate?: Date;
  callCount: number;
  lastCallAt?: Date;
  source?: string;
  active: boolean;
}

const leadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['new', 'in_progress', 'callback', 'closed', 'dead'],
      default: 'new',
    },
    notes: String,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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

leadSchema.index({ phone: 1 }, { unique: true });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ leaderId: 1 });
leadSchema.index({ status: 1 });

export const Lead = model<ILead>('Lead', leadSchema);
