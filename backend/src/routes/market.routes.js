import { Router } from 'express';
import * as marketController from '../controllers/marketController.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { marketPricesQuerySchema } from '../validators/market.validator.js';

const router = Router();

// Public on purpose: sample prices power the landing page before login, which
// supports MandiLink's price-transparency goal. No private data is exposed.
router.get(
  '/',
  validate({ query: marketPricesQuerySchema }),
  asyncHandler(marketController.list),
);

export default router;
