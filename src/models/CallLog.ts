import { Document, model, Schema } from 'mongoose';

export interface ICallLog extends Document {
  leadId: Schema.Types.ObjectId;
  telecallerId: Schema.Types.ObjectId;
  duration: number;
  result: 'answered' | 'missed' | 'callback' | 'converted';
  remarks?: string;
  createdAt: Date;
}

const callLogSchema = new Schema<ICallLog>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    telecallerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    duration: { type: Number, required: true },
    result: {
      type: String,
      enum: ['answered', 'missed', 'callback', 'converted'],
      required: true,
    },
    remarks: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

export const CallLog = model<ICallLog>('CallLog', callLogSchema);
