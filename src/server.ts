import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import serverless from 'serverless-http';
import swaggerUi from 'swagger-ui-express';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import leadRoutes from './routes/lead.routes';
import dashboardRoutes from './routes/dashboard.routes';
import goalRoutes from './routes/goal.routes';
import callRoutes from './routes/call.routes';
import activityRoutes from './routes/activity.routes';
import notificationRoutes from './routes/notification.routes';
import teamRoutes from './routes/team.routes';
import { User } from './models/Users';

dotenv.config();

let swaggerFile: any = {};
try {
  swaggerFile = require('./config/swagger-output.json');
} catch (e) {
  swaggerFile = {};
}

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

/* =============== ROUTES =============== */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    dbState: mongoose.connection.readyState,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/calls', callRoutes);

// app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

/* =============== DATABASE CONNECTION =============== */
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  const uri = process.env.MONGODB_URI!;
  if (!uri) throw new Error('❌ MONGODB_URI missing in .env');

  try {
    const db = await mongoose.connect(uri);
    isConnected = !!db.connections[0].readyState;
    console.log('✅ MongoDB connected');
    await seedAdmin();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    throw err;
  }
}

/* =============== SEED ADMIN =============== */
async function seedAdmin() {
  if (!process.env.ADMIN_EMAIL) return;
  const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
  if (!existing) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD!, 10);
    await User.create({
      firstName: process.env.ADMIN_NAME_F || 'Admin',
      lastName: process.env.ADMIN_NAME_L || 'Admin',
      email: process.env.ADMIN_EMAIL!,
      passwordHash,
      role: 'admin',
    });
    console.log(`Seeded admin: ${process.env.ADMIN_EMAIL}`);
  }
}

/* =============== SERVERLESS HANDLER =============== */
export default app;
/* =============== LOCAL DEV MODE ONLY =============== */
if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT) || 5050;

  connectDB().then(() => {
    app.listen(port, () =>
      console.log(`🚀 Local server running at http://localhost:${port}`)
    );
  });
} else {
  // For Vercel (production), ensure DB connects ONCE
  connectDB();
}
// export const handler = async (req: any, res: any) => {
//   await connectDB();
//   const expressHandler = serverless(app);
//   return expressHandler(req, res);
// };

// /* =============== LOCAL DEV MODE =============== */
// if (process.env.NODE_ENV !== 'production') {
//   const port = Number(process.env.PORT) || 5050;
//   connectDB().then(() => {
//     app.listen(port, () =>
//       console.log(`🚀 Local server running at http://localhost:${port}`)
//     );
//   });
// }

// export default handler;
