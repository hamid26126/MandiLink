import { z } from 'zod';

export const CATEGORIES = ['wheat', 'rice', 'vegetable', 'fruit', 'other'];
export const QUALITIES = ['A', 'B', 'C'];
export const LISTING_STATUSES = ['active', 'sold', 'closed'];
export const SORT_OPTIONS = ['newest', 'price_asc', 'price_desc'];

// Fields shared by create and update. No defaults here so a partial update
// never silently resets a value the client did not send.
const listingFields = {
  crop_name: z
    .string()
    .trim()
    .min(2, 'Crop name must be at least 2 characters')
    .max(80, 'Crop name is too long'),
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: 'Choose a valid category' }),
  }),
  quantity_mann: z.coerce
    .number()
    .positive('Quantity must be greater than 0')
    .max(1_000_000, 'Quantity is too large'),
  price_per_mann: z.coerce
    .number()
    .positive('Price must be greater than 0')
    .max(10_000_000, 'Price is too large'),
  district: z.string().trim().min(2, 'District is required').max(80, 'District is too long'),
  quality: z.enum(QUALITIES, {
    errorMap: () => ({ message: 'Quality must be A, B or C' }),
  }),
  description: z.string().trim().max(1000, 'Description is too long').optional().nullable(),
};

export const createListingSchema = z.object({
  ...listingFields,
  quality: listingFields.quality.default('A'),
});

export const updateListingSchema = z
  .object({
    crop_name: listingFields.crop_name.optional(),
    category: listingFields.category.optional(),
    quantity_mann: listingFields.quantity_mann.optional(),
    price_per_mann: listingFields.price_per_mann.optional(),
    district: listingFields.district.optional(),
    quality: listingFields.quality.optional(),
    description: listingFields.description,
    // Farmers may close/reopen a listing manually. "sold" is set by the
    // backend when accepted offers use up the quantity, so it is not allowed.
    status: z.enum(['active', 'closed']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listListingsQuerySchema = z
  .object({
    search: z.string().trim().max(80).optional(),
    category: z.enum(CATEGORIES).optional(),
    district: z.string().trim().max(80).optional(),
    price_min: z.coerce.number().positive().optional(),
    price_max: z.coerce.number().positive().optional(),
    status: z.enum(LISTING_STATUSES).optional(),
    sort: z.enum(SORT_OPTIONS).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(9),
  })
  .refine(
    (data) => !data.price_min || !data.price_max || data.price_min <= data.price_max,
    { message: 'price_min cannot be greater than price_max', path: ['price_min'] },
  );
