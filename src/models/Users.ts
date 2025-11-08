import { Document, model, Schema, Types } from 'mongoose';

export interface IUser extends Document {
  firstName: string;
  lastName?: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'leader' | 'telecaller';
  leaderId?: Types.ObjectId | null;
  active: boolean;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
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

// Keep fullName always updated
userSchema.pre('save', function (next) {
  this.fullName = `${this.firstName} ${this.lastName || ''}`.trim();
  next();
});

export const User = model<IUser>('User', userSchema);