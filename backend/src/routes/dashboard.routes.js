import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authenticate);

router.get('/farmer', authorize('farmer'), asyncHandler(dashboardController.farmer));
router.get('/buyer', authorize('buyer'), asyncHandler(dashboardController.buyer));

export default router;
