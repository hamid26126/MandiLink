/**
 * Every successful response uses the same shape:
 *   { success: true, data: ..., message: '...' }
 * This makes the API predictable for the web app and the future mobile app.
 */
export function sendSuccess(res, data = null, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}
