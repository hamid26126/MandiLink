import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { isProduction } from '../config/env.js';

/**
 * Central error handler. Every route is wrapped with asyncHandler and every
 * failure ends up here, so clients always receive the same JSON shape and
 * stack traces never leak in production.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  let statusCode = 500;
  let message = 'Something went wrong';
  let details = null;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    details = error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
  } else if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body must be valid JSON';
  } else if (error.code === '23505') {
    statusCode = 409;
    message = 'This record already exists';
  }

  // Log unexpected server errors with their original cause for debugging.
  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error.cause || error);
  }

  // In production, never expose internal error text for 5xx responses.
  if (isProduction && statusCode >= 500) {
    message = 'Something went wrong. Please try again later.';
  }

  const payload = { success: false, error: { message } };
  if (details) payload.error.details = details;

  return res.status(statusCode).json(payload);
}
