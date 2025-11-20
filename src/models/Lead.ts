import { Document, model, Schema, Types } from 'mongoose';

export interface ILead extends Document {
  name: string;
  phone: string;
  notes?: string;
  status: 'new' | 'in_progress' | 'callback' | 'closed' | 'dead';
  behaviour?: 'warm' | 'hot' | 'cold'; // NEW optional
  assignedTo?: Types.ObjectId | null;
  leaderId?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | string;
  nextCallDate?: Date;
  callCount: number; // used for goal/first-status-change tracking
  lastCallAt?: Date;
  source?: string;
  active: boolean;
}

const leadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, trim: true },

    notes: String,

    status: {
      type: String,
      enum: ['new', 'in_progress', 'callback', 'closed', 'dead'],
      default: 'new',
      index: true,
    },

    behaviour: {
      type: String,
      enum: ['warm', 'hot', 'cold'],
      default: null, // optional behaviour flag
    },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

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
leadSchema.index({ phone: 1, active: 1 }, { unique: true });

export const Lead = model<ILead>('Lead', leadSchema);