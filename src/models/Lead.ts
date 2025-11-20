import { Document, model, Schema, Types } from 'mongoose';

export interface ILead extends Document {
  name: string;
  phone: string;
  notes?: string;
  status: 'new' | 'in_progress' | 'callback' | 'closed' | 'dead';
  assignedTo?: Types.ObjectId | null;
  leaderId?: Types.ObjectId | null;
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
    notes: String,
    status: {
      type: String,
      enum: ['new', 'in_progress', 'callback', 'closed', 'dead'],
      default: 'new',
      index : true
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default : null },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', default : null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    
    callCount: { type: Number, default: 0 },
    lastCallAt: Date,
    
    nextCallDate: Date,
    active: { type: Boolean, default: true },
    source: { type: String, trim: true },
  },
  { timestamps: true }
);

leadSchema.index({ assignedTo: 1 });
leadSchema.index({ leaderId: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({phone : 1, active : 1}, {unique : true})

export const Lead = model<ILead>('Lead', leadSchema);
