import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

// Reused everywhere a listing needs the farmer's public details.
const LISTING_SELECT =
  '*, farmer:profiles!crop_listings_farmer_id_fkey(id, full_name, phone, district)';

/**
 * Load the newest sample market price for a crop in a district. This powers the
 * "your price vs market rate" card on the listing detail page. If no sample
 * exists we simply return null instead of failing the request.
 */
async function getMarketPrice(cropName, district) {
  const { data, error } = await supabase
    .from('mandi_prices')
    .select('crop_name, district, price_per_mann, recorded_on')
    .ilike('crop_name', cropName)
    .ilike('district', district)
    .order('recorded_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw ApiError.internal('Could not load market prices', error);
  return data ?? null;
}

function buildComparison(pricePerMann, marketPrice) {
  if (!marketPrice) return null;

  const market = Number(marketPrice.price_per_mann);
  const difference = Number((pricePerMann - market).toFixed(2));

  return {
    market_price_per_mann: market,
    difference,
    // Positive means the farmer is asking above the sample market rate.
    percent_difference: Number(((difference / market) * 100).toFixed(2)),
    recorded_on: marketPrice.recorded_on,
  };
}

export async function listListings(filters) {
  const { page, limit, search, category, district, price_min, price_max, status, sort } =
    filters;

  let query = supabase.from('crop_listings').select(LISTING_SELECT, { count: 'exact' });

  if (search) query = query.ilike('crop_name', `%${search}%`);
  if (category) query = query.eq('category', category);
  if (district) query = query.ilike('district', district);
  if (price_min !== undefined) query = query.gte('price_per_mann', price_min);
  if (price_max !== undefined) query = query.lte('price_per_mann', price_max);
  if (status) query = query.eq('status', status);

  if (sort === 'price_asc') query = query.order('price_per_mann', { ascending: true });
  else if (sort === 'price_desc') query = query.order('price_per_mann', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw ApiError.internal('Could not load listings', error);

  const total = count ?? 0;
  return {
    items: data ?? [],
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

export async function getListingById(id) {
  const { data: listing, error } = await supabase
    .from('crop_listings')
    .select(LISTING_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw ApiError.internal('Could not load this listing', error);
  if (!listing) throw ApiError.notFound('Listing not found');

  const marketPrice = await getMarketPrice(listing.crop_name, listing.district);

  return {
    ...listing,
    market_price: marketPrice,
    market_comparison: buildComparison(Number(listing.price_per_mann), marketPrice),
  };
}

export async function createListing(farmerId, payload) {
  const { data, error } = await supabase
    .from('crop_listings')
    .insert({
      farmer_id: farmerId,
      crop_name: payload.crop_name,
      category: payload.category,
      quantity_mann: payload.quantity_mann,
      price_per_mann: payload.price_per_mann,
      district: payload.district,
      quality: payload.quality,
      description: payload.description ?? null,
    })
    .select(LISTING_SELECT)
    .single();

  if (error) throw ApiError.internal('Could not create the listing', error);
  return data;
}

async function getListingForWrite(listingId) {
  const { data, error } = await supabase
    .from('crop_listings')
    .select('id, farmer_id')
    .eq('id', listingId)
    .maybeSingle();

  if (error) throw ApiError.internal('Could not load this listing', error);
  if (!data) throw ApiError.notFound('Listing not found');
  return data;
}

/**
 * Ownership is checked in the service, not only in middleware, because the
 * service is the only layer that knows WHICH listing is being changed.
 */
async function assertOwnership(listingId, farmerId) {
  const listing = await getListingForWrite(listingId);
  if (listing.farmer_id !== farmerId) {
    throw ApiError.forbidden('You can only manage your own listings');
  }
  return listing;
}

export async function updateListing(listingId, farmerId, payload) {
  await assertOwnership(listingId, farmerId);

  const { data, error } = await supabase
    .from('crop_listings')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', listingId)
    .select(LISTING_SELECT)
    .single();

  if (error) throw ApiError.internal('Could not update the listing', error);
  return data;
}

export async function deleteListing(listingId, farmerId) {
  await assertOwnership(listingId, farmerId);

  const { error } = await supabase.from('crop_listings').delete().eq('id', listingId);
  if (error) throw ApiError.internal('Could not delete the listing', error);
}

export async function listMyListings(farmerId) {
  const { data, error } = await supabase
    .from('crop_listings')
    .select(LISTING_SELECT)
    .eq('farmer_id', farmerId)
    .order('created_at', { ascending: false });

  if (error) throw ApiError.internal('Could not load your listings', error);
  return data ?? [];
}

export { getMarketPrice };
