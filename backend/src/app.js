import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sendSuccess } from './utils/response.js';

const app = express();

// Security headers. The API only returns JSON, so the defaults are enough.
app.use(helmet());

// CORS is configurable via CLIENT_ORIGIN, so the same backend can serve the web
// app now and the mobile app later without code changes.
app.use(
  cors({
    origin: env.clientOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json({ limit: '1mb' }));

// Short, unauthenticated health check for uptime monitors and local testing.
app.get('/health', (req, res) =>
  sendSuccess(
    res,
    { status: 'ok', uptime: Math.round(process.uptime()) },
    'MandiLink API is running',
  ),
);

// Versioned API: future mobile clients can target /api/v1 too.
app.use('/api/v1', apiLimiter, apiRoutes);

// Order matters: unknown route -> 404, then the central error handler.
app.use(notFound);
app.use(errorHandler);

export default app;
