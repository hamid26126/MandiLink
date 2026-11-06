import { supabase, authClient } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

function toSession(session) {
  if (!session) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    token_type: session.token_type,
  };
}

async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw ApiError.internal('Could not load your profile', error);
  return data;
}

/**
 * Register a new farmer or buyer.
 *
 * Two systems must stay in sync: Supabase Auth (email/password) and our
 * profiles table (role, name, district...). We create the auth user first, then
 * the profile. If the profile insert fails we delete the auth user again, so we
 * never leave a half-created account that can log in but has no role.
 */
export async function register(payload) {
  const {
    email,
    password,
    full_name,
    phone,
    role,
    district,
    buyer_type = null,
  } = payload;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    // Skipping email confirmation keeps the semester demo smooth. In a real
    // deployment this would be false and users would confirm their email.
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  if (createError) {
    if (createError.status === 422 || /already/i.test(createError.message)) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw ApiError.badRequest(createError.message || 'Could not create your account');
  }

  const userId = created.user.id;

  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    role,
    full_name,
    phone,
    district,
    // Farmers never have a buyer type, even if a client sends one.
    buyer_type: role === 'buyer' ? buyer_type : null,
  });

  if (profileError) {
    // Rollback: remove the auth user so the email can be used again.
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    throw ApiError.internal('Could not create your profile. Please try again.', profileError);
  }

  const profile = await getProfileById(userId);

  // Sign in immediately so the client receives a usable session after signup.
  // This uses authClient, not the admin client, so the admin client keeps using
  // the service-role key for database queries.
  const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    throw ApiError.internal('Account created but automatic login failed. Please log in.', signInError);
  }

  return { user: profile, session: toSession(authData.session) };
}

export async function login({ email, password }) {
  // authClient holds the user session; the service-role client stays clean.
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  // Deliberately vague message: do not reveal whether the email exists.
  if (error || !data?.session) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const profile = await getProfileById(data.user.id);
  if (!profile) {
    throw ApiError.unauthorized('No profile is linked to this account');
  }

  return { user: profile, session: toSession(data.session) };
}

export async function refresh(refreshToken) {
  const { data, error } = await authClient.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data?.session) {
    throw ApiError.unauthorized('Your session has expired. Please log in again.');
  }

  const profile = await getProfileById(data.user.id);
  if (!profile) {
    throw ApiError.unauthorized('No profile is linked to this account');
  }

  return { user: profile, session: toSession(data.session) };
}

/**
 * Revoke the user's session in Supabase Auth. This is best effort: the client
 * always deletes its local tokens, and access tokens expire on their own even
 * if the admin call fails (for example during local development).
 */
export async function logout(accessToken) {
  if (!accessToken) return;
  try {
    await supabase.auth.admin.signOut(accessToken);
  } catch (error) {
    console.warn('[auth] Could not revoke session:', error.message);
  }
}

export async function getMe(userId) {
  const profile = await getProfileById(userId);
  if (!profile) throw ApiError.notFound('Profile not found');
  return profile;
}

export { getProfileById };
