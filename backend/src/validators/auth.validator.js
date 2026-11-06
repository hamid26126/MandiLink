import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');

// Supabase passwords allow up to 72 bytes; requiring 8 keeps demo accounts safe.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

const fullName = z
  .string()
  .trim()
  .min(2, 'Full name must be at least 2 characters')
  .max(100, 'Full name is too long');

const phone = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(20, 'Phone number is too long')
  .regex(/^[0-9+\-\s()]+$/, 'Phone can only contain digits, spaces and + - ( )');

const district = z
  .string()
  .trim()
  .min(2, 'District is required')
  .max(80, 'District is too long');

const buyerType = z.enum(['retailer', 'wholesaler', 'bulk_buyer']);

// "admin" is deliberately missing: it must never be self-registrable.
const role = z.enum(['farmer', 'buyer']);

export const registerSchema = z
  .object({
    email,
    password,
    full_name: fullName,
    phone,
    role,
    district,
    buyer_type: buyerType.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // buyer_type belongs to buyers only. Rejecting it for farmers keeps the
    // profile rows consistent with the database CHECK constraint.
    if (data.role === 'farmer' && data.buyer_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buyer_type'],
        message: 'buyer_type is only allowed for buyers',
      });
    }
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(10, 'refresh_token is required'),
});
