import * as authService from '../services/authService.js';
import { sendSuccess } from '../utils/response.js';

export async function register(req, res) {
  const data = await authService.register(req.body);
  return sendSuccess(res, data, 'Account created successfully', 201);
}

export async function login(req, res) {
  const data = await authService.login(req.body);
  return sendSuccess(res, data, 'Logged in successfully');
}

export async function refresh(req, res) {
  const data = await authService.refresh(req.body.refresh_token);
  return sendSuccess(res, data, 'Session refreshed');
}

export async function logout(req, res) {
  await authService.logout(req.accessToken);
  return sendSuccess(res, null, 'Logged out successfully');
}

export async function me(req, res) {
  // authenticate() already attached a fresh profile to req.user.
  return sendSuccess(res, req.user, 'Profile loaded');
}
