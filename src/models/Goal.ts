import { Document, model, Schema } from 'mongoose';

export type GoalType = 'weekly_calls';
export type GoalPeriod = 'weekly';
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
      enum: ['weekly_calls'],
      required: true,
      index: true,
      default: 'weekly_calls',
    },
    period: {
      type: String,
      enum: ['weekly'],
      required: true,
      default: 'weekly',
    },
    target: { type: Number, required: true, min: 1 },
    achieved: { type: Number, default: 0, min: 0 },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const Goal = model<IGoal>('Goal', goalSchema);
