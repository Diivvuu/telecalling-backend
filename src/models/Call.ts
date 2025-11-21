import { Document, model, Schema } from 'mongoose';

export type CallResult = 'answered' | 'missed' | 'callback' | 'converted';

export interface ICallLog extends Document {
  leadId: Schema.Types.ObjectId;
  telecallerId: Schema.Types.ObjectId;
  result: CallResult;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const callLogSchema = new Schema<ICallLog>(
  {
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    telecallerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    result: {
      type: String,
      enum: ['answered', 'missed', 'callback', 'converted'],
      required: true,
    },
    remarks: { type: String },
  },
  { timestamps: true }
);

export const CallLog = model<ICallLog>('CallLog', callLogSchema);