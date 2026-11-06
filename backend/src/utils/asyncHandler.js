/**
 * Wraps an async Express handler so a rejected promise is forwarded to
 * next(error). Without this, an async error could become an unhandled
 * rejection and the request would hang.
 */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
