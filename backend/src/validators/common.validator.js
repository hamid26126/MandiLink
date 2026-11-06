import { z } from 'zod';

// Shared param schema for routes like /listings/:id and /offers/:id.
// Validating the UUID early gives a clean 400 instead of a database error.
export const idParamSchema = z.object({
  id: z.string().uuid('Invalid id'),
});

export const listingIdParamSchema = idParamSchema;
