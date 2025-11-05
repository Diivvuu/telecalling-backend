import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import leadRoutes from './routes/lead.routes';
import dashboardRoutes from './routes/dashboard.routes';

import { User } from './models/Users';

import swaggerUi from 'swagger-ui-express';
import swaggerFile from './config/swagger-output.json';

dotenv.config();

mongoose.set('strictQuery', true);

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// routes
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  res.json({
    ok: true,
    dbState,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET missing in .env');
  process.exit(1);
}

// seed admin if missing
const seedAdmin = async () => {
  const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
  if (!existing) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD!, 10);
    await User.create({
      email: process.env.ADMIN_EMAIL!,
      passwordHash,
      role: 'admin',
    });
    console.log(`Seeded admin: ${process.env.ADMIN_EMAIL}`);
  }
};

const start = async () => {
  const port = Number(process.env.PORT) || 8080;
  console.log('Starting Express server...');
  app.listen(port, '0.0.0.0', () =>
    console.log(`Server running on http://localhost:${port}`)
  );
  console.log('✅ Express is now listening for requests');
  // connect with retry so the process doesn't hang
  const uri = process.env.MONGODB_URI!;
  if (!uri) {
    console.error('❌ MONGODB_URI missing in .env');
    return;
  }
  console.log('Connecting to MongoDB...', uri);

  let attempts = 0;
  const connectWithRetry = async () => {
    try {
      attempts++;
      console.log(`[MongoDB] Attempt ${attempts} → ${uri}`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      console.log('✅ MongoDB connected');

      mongoose.connection.on('error', (err) =>
        console.error('❌ MongoDB connection error:', err.message)
      );
      mongoose.connection.on('disconnected', () =>
        console.warn('⚠️ MongoDB disconnected, retrying...')
      );

      await seedAdmin();
    } catch (err) {
      console.error(
        `❌ MongoDB connect failed (attempt ${attempts}):`,
        (err as any)?.message || err
      );
      setTimeout(connectWithRetry, Math.min(15000, 2000 * attempts)); // backoff
    }
  };
  connectWithRetry();
};

start();
