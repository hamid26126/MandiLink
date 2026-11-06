import app from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.port, () => {
  console.log(`MandiLink API listening on http://localhost:${env.port}`);
  console.log(`Health check: http://localhost:${env.port}/health`);
  console.log(`Allowed client origin(s): ${env.clientOrigins.join(', ')}`);
});

// Last-resort safety nets. Logging a rejected promise is much better than
// Node silently terminating without a clue about what failed.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
  server.close(() => process.exit(1));
});

// Graceful shutdown so nodemon restarts do not leave the port occupied.
const shutdown = (signal) => {
  console.log(`\n${signal} received. Closing server...`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
