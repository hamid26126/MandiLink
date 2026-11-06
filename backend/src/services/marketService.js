import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Return SAMPLE mandi reference prices. Filters are case-insensitive partial
 * matches so "wheat" finds "Wheat (Faisalabad)". This is demo data used for a
 * simple comparison, not a live mandi feed.
 */
export async function listMarketPrices({ crop_name, district }) {
  let query = supabase
    .from('mandi_prices')
    .select('*')
    .order('crop_name', { ascending: true })
    .order('district', { ascending: true })
    .order('recorded_on', { ascending: false });

  if (crop_name) query = query.ilike('crop_name', `%${crop_name}%`);
  if (district) query = query.ilike('district', `%${district}%`);

  const { data, error } = await query.limit(200);
  if (error) throw ApiError.internal('Could not load market prices', error);

  return data ?? [];
}
