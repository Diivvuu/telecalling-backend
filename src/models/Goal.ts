import { Document, model, Schema } from 'mongoose';

export type GoalType = 'daily_calls' | 'weekly_calls' | 'conversions';
export type GoalPeriod = 'daily' | 'weekly';
export interface IGoal extends Document {
  userId: Schema.Types.ObjectId;
  type: GoalType;
  period: GoalPeriod;
  target: number;
  achieved: number;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const goalSchema = new Schema<IGoal>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['daily_calls', 'weekly_calls', 'conversions'],
      required: true,
      index: true,
    },
    period: {
      type: String,
      enum: ['daily', 'weekly'],
      required: true,
    },
    target: { type: Number, required: true, min: 1 },
    achieved: { type: Number, default: 0, min: 0 },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const Goal = model<IGoal>('Goal', goalSchema);
