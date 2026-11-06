import { Router } from 'express';
import * as listingController from '../controllers/listingController.js';
import * as offerController from '../controllers/offerController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createListingSchema,
  listListingsQuerySchema,
  updateListingSchema,
} from '../validators/listing.validator.js';
import { createOfferSchema } from '../validators/offer.validator.js';

const router = Router();

// Everything under /listings requires a logged-in user.
router.use(authenticate);

// IMPORTANT: /mine must be declared before /:id, otherwise Express would treat
// "mine" as an id.
router.get('/mine', authorize('farmer'), asyncHandler(listingController.mine));

router.get('/', validate({ query: listListingsQuerySchema }), asyncHandler(listingController.list));

router.post(
  '/',
  authorize('farmer'),
  validate({ body: createListingSchema }),
  asyncHandler(listingController.create),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(listingController.getOne),
);

router.put(
  '/:id',
  authorize('farmer'),
  validate({ params: idParamSchema, body: updateListingSchema }),
  asyncHandler(listingController.update),
);

router.delete(
  '/:id',
  authorize('farmer'),
  validate({ params: idParamSchema }),
  asyncHandler(listingController.remove),
);

// Offers are a sub-resource of a listing: buyers create them here and the
// owning farmer reads them here. The Offer service still checks ownership.
router.post(
  '/:id/offers',
  authorize('buyer'),
  validate({ params: idParamSchema, body: createOfferSchema }),
  asyncHandler(offerController.create),
);

router.get(
  '/:id/offers',
  authorize('farmer'),
  validate({ params: idParamSchema }),
  asyncHandler(offerController.forListing),
);

export default router;
