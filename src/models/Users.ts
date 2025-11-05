import { Document, model, Schema, Types } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: 'admin' | 'leader' | 'telecaller';
  leaderId?: Types.ObjectId | null;
  active: boolean;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['admin', 'leader', 'telecaller'],
      required: true,
    },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);

