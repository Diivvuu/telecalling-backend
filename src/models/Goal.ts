import { Document, model, Schema } from 'mongoose';

export interface IGoal extends Document {
  userId: Schema.Types.ObjectId;
  type: 'daily_calls' | 'weekly_calls' | 'conversions';
  period: 'daily' | 'weekly';
  target: number;
  achieved: number;
  startDate: Date;
  endDate: Date;
}

const goalSchema = new Schema<IGoal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // goal type determines what it tracks
    type: {
      type: String,
      enum: ['daily_calls', 'weekly_calls', 'conversions'],
      required: true,
    },

    // period helps frontend group goals easily
    period: {
      type: String,
      enum: ['daily', 'weekly'],
      required: true,
    },

    target: { type: Number, required: true },
    achieved: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true }
);

export const Goal = model<IGoal>('Goal', goalSchema);