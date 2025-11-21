import serverless from 'serverless-http';
import app from '../server';

export const config = {
  runtime: 'nodejs22.x',
};

export default serverless(app);
