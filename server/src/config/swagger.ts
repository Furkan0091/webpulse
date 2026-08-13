import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'WebPulse API',
      version: '1.0.0',
      description:
        'Website & API monitoring, incident detection and observability platform. ' +
        'Authentication uses JWT bearer tokens; organization-scoped endpoints are prefixed with `/orgs/:organizationId`.',
    },
    servers: [{ url: '/api', description: 'API root' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/routes/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
