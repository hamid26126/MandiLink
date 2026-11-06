/**
 * Error type used across the API. Controllers/services throw this and the
 * central errorHandler turns it into a consistent JSON response. Keeping the
 * HTTP status next to the message avoids scattering res.status(...) everywhere.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null, cause = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    // The original error is logged server-side but never sent to clients.
    this.cause = cause;
  }

  static badRequest(message = 'Invalid request', details = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Request conflicts with the current state') {
    return new ApiError(409, message);
  }

  static internal(message = 'Something went wrong', cause = null) {
    return new ApiError(500, message, null, cause);
  }
}
