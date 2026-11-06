import { Router } from 'express';
import * as offerController from '../controllers/offerController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idParamSchema } from '../validators/common.validator.js';

const router = Router();

router.use(authenticate);

router.get('/mine', authorize('buyer'), asyncHandler(offerController.mine));

// Accept/reject are farmer actions; withdraw is a buyer action.
router.patch(
  '/:id/accept',
  authorize('farmer'),
  validate({ params: idParamSchema }),
  asyncHandler(offerController.accept),
);

router.patch(
  '/:id/reject',
  authorize('farmer'),
  validate({ params: idParamSchema }),
  asyncHandler(offerController.reject),
);

router.patch(
  '/:id/withdraw',
  authorize('buyer'),
  validate({ params: idParamSchema }),
  asyncHandler(offerController.withdraw),
);

export default router;
