import { z } from 'zod';

export const createOfferSchema = z.object({
  offered_price_per_mann: z.coerce
    .number()
    .positive('Offer price must be greater than 0')
    .max(10_000_000, 'Offer price is too large'),
  quantity_mann: z.coerce
    .number()
    .positive('Quantity must be greater than 0')
    .max(1_000_000, 'Quantity is too large'),
  message: z.string().trim().max(500, 'Message is too long').optional().nullable(),
});
