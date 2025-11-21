import serverless from 'serverless-http';
import app from '../server';

export default serverless(app); // DO NOT export "app" directly, use serverless wrapper

export const config = {
  runtime: 'nodejs22.x',
};
