import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Farmer dashboard data. The farmer only sees figures for their own listings,
 * so we first collect their listing ids and then count offers on those ids.
 */
export async function getFarmerDashboard(farmerId) {
  const { data: listings, error: listingsError } = await supabase
    .from('crop_listings')
    .select('id, status')
    .eq('farmer_id', farmerId);

  if (listingsError) throw ApiError.internal('Could not load your dashboard', listingsError);

  const listingIds = (listings ?? []).map((listing) => listing.id);
  const activeListings = (listings ?? []).filter((listing) => listing.status === 'active').length;

  let pendingOffers = 0;
  let acceptedOffers = 0;
  let totalSoldQuantity = 0;
  let recentOffers = [];

  if (listingIds.length > 0) {
    const [pendingResult, acceptedResult, recentResult] = await Promise.all([
      supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .in('listing_id', listingIds)
        .eq('status', 'pending'),
      supabase
        .from('offers')
        .select('quantity_mann')
        .in('listing_id', listingIds)
        .eq('status', 'accepted'),
      supabase
        .from('offers')
        .select(
          '*, buyer:profiles!offers_buyer_id_fkey(id, full_name, district), listing:crop_listings!offers_listing_id_fkey(id, crop_name)',
        )
        .in('listing_id', listingIds)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    if (pendingResult.error) throw ApiError.internal('Could not count pending offers', pendingResult.error);
    if (acceptedResult.error) throw ApiError.internal('Could not count accepted offers', acceptedResult.error);
    if (recentResult.error) throw ApiError.internal('Could not load recent offers', recentResult.error);

    pendingOffers = pendingResult.count ?? 0;
    acceptedOffers = (acceptedResult.data ?? []).length;
    totalSoldQuantity = (acceptedResult.data ?? []).reduce(
      (total, offer) => total + Number(offer.quantity_mann),
      0,
    );
    recentOffers = recentResult.data ?? [];
  }

  return {
    stats: {
      active_listings: activeListings,
      pending_offers: pendingOffers,
      accepted_offers: acceptedOffers,
      total_sold_quantity: Number(totalSoldQuantity.toFixed(2)),
    },
    recent_offers: recentOffers,
  };
}

/**
 * Buyer dashboard data: their own offer counts plus fresh listings from their
 * own district, which are usually the most relevant opportunities.
 */
export async function getBuyerDashboard(buyerId, district) {
  const [offersResult, recentResult, listingsResult] = await Promise.all([
    supabase.from('offers').select('status').eq('buyer_id', buyerId),
    supabase
      .from('offers')
      .select(
        '*, listing:crop_listings!offers_listing_id_fkey(id, crop_name, district, price_per_mann, status)',
      )
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('crop_listings')
      .select('*, farmer:profiles!crop_listings_farmer_id_fkey(id, full_name, district)')
      .eq('status', 'active')
      .ilike('district', district)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (offersResult.error) throw ApiError.internal('Could not load your dashboard', offersResult.error);
  if (recentResult.error) throw ApiError.internal('Could not load recent offers', recentResult.error);
  if (listingsResult.error) throw ApiError.internal('Could not load latest listings', listingsResult.error);

  const offers = offersResult.data ?? [];
  const countByStatus = (status) => offers.filter((offer) => offer.status === status).length;

  return {
    stats: {
      pending_offers: countByStatus('pending'),
      accepted_offers: countByStatus('accepted'),
      rejected_offers: countByStatus('rejected'),
      total_offers: offers.length,
    },
    recent_offers: recentResult.data ?? [],
    newest_listings: listingsResult.data ?? [],
  };
}
