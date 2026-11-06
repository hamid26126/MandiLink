import * as dashboardService from '../services/dashboardService.js';
import { sendSuccess } from '../utils/response.js';

export async function farmer(req, res) {
  const data = await dashboardService.getFarmerDashboard(req.user.id);
  return sendSuccess(res, data, 'Farmer dashboard loaded');
}

export async function buyer(req, res) {
  const data = await dashboardService.getBuyerDashboard(req.user.id, req.user.district);
  return sendSuccess(res, data, 'Buyer dashboard loaded');
}
