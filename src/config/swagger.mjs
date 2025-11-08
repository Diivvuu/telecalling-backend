// swagger.js
import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'Telecalling Pro API',
    description: 'Auto-generated Swagger Docs for Telecalling Backend',
    version: '1.0.0',
  },
  host: 'localhost:5050',
  schemes: ['http'],
  consumes: ['application/json'],
  produces: ['application/json'],
  securityDefinitions: {
    BearerAuth: {
      type: 'apiKey',
      name: 'Authorization',
      in: 'header',
      description: 'Bearer <JWT token>',
    },
  },
  security: [{ BearerAuth: [] }],
};

const outputFile = './swagger-output.json';
const endpointsFiles = ['./src/server.ts']; // entry that references all routes

swaggerAutogen()(outputFile, endpointsFiles, doc);
