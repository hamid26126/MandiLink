import { supabase, authClient } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Authentication middleware.
 *
 * Step by step:
 *   1. Read the "Authorization: Bearer <supabase-jwt>" header.
 *   2. Ask Supabase Auth to verify the JWT (supabase.auth.getUser).
 *   3. Load the matching application profile, which contains the role.
 *   4. Attach both to req.user so authorize() and services can use them.
 *
 * We verify on every request (not just decode) so revoked or expired tokens
 * are rejected. The profile lookup is what gives us the app-level role.
 */
export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Please log in to continue');
  }

  // Verify with the auth client, not the admin client, so no session is ever
  // attached to the privileged database client.
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    throw ApiError.unauthorized('Your session is invalid or has expired');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    throw ApiError.internal('Could not load your profile', profileError);
  }
  if (!profile) {
    throw ApiError.unauthorized('No profile is linked to this account');
  }

  req.user = { ...profile, email: data.user.email };
  req.accessToken = token;
  next();
});
