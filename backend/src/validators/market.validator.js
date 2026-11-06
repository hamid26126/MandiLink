import { z } from 'zod';

export const marketPricesQuerySchema = z.object({
  crop_name: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
});
