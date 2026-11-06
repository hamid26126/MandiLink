import { ApiError } from '../utils/ApiError.js';

/**
 * Runs after all routes. Any unmatched URL becomes a 404 with the standard
 * error response shape instead of Express' default HTML page.
 */
export function notFound(req, res, next) {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
}
