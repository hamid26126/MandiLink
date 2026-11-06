import * as marketService from '../services/marketService.js';
import { sendSuccess } from '../utils/response.js';

export async function list(req, res) {
  const data = await marketService.listMarketPrices(req.query);
  return sendSuccess(res, data, 'Sample market prices loaded');
}
