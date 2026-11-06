import { ApiError } from '../utils/ApiError.js';

/**
 * Role gate used after authenticate(). Example:
 *   router.post('/', authenticate, authorize('farmer'), createListing)
 * A buyer calling a farmer-only route receives 403, not 401: they are logged
 * in, they just do not have the right role. Services still re-check ownership.
 */
export const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Please log in to continue'));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(
      ApiError.forbidden(
        `This action requires a ${allowedRoles.join(' or ')} account`,
      ),
    );
  }

  next();
};
