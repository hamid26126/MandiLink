import { Router } from 'express';
import authRoutes from './auth.routes.js';
import listingRoutes from './listing.routes.js';
import offerRoutes from './offer.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import marketRoutes from './market.routes.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.get('/health', (req, res) =>
  sendSuccess(
    res,
    { status: 'ok', uptime: Math.round(process.uptime()) },
    'MandiLink API is running',
  ),
);

router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/offers', offerRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/market-prices', marketRoutes);

export default router;
