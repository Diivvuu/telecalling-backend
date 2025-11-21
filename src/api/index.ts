// src/api/index.ts
import serverless from 'serverless-http';
import app from '../server';

export default serverless(app);

export const config = {
  runtime: 'nodejs22.x',
};
