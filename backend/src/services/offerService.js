import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

async function sumAcceptedQuantity(listingId) {
  const { data, error } = await supabase
    .from('offers')
    .select('quantity_mann')
    .eq('listing_id', listingId)
    .eq('status', 'accepted');

  if (error) throw ApiError.internal('Could not calculate available quantity', error);

  return (data ?? []).reduce((total, row) => total + Number(row.quantity_mann), 0);
}

/**
 * Load an offer together with the listing it belongs to. Accept/reject need
 * both the offer (status) and the listing (owner, total quantity).
 */
async function getOfferWithListing(offerId) {
  const { data, error } = await supabase
    .from('offers')
    .select(
      '*, listing:crop_listings!offers_listing_id_fkey(id, farmer_id, crop_name, quantity_mann, status)',
    )
    .eq('id', offerId)
    .maybeSingle();

  if (error) throw ApiError.internal('Could not load this offer', error);
  if (!data) throw ApiError.notFound('Offer not found');
  return data;
}

export async function createOffer(listingId, buyerId, payload) {
  const { data: listing, error: listingError } = await supabase
    .from('crop_listings')
    .select('id, farmer_id, crop_name, status, quantity_mann')
    .eq('id', listingId)
    .maybeSingle();

  if (listingError) throw ApiError.internal('Could not load this listing', listingError);
  if (!listing) throw ApiError.notFound('Listing not found');

  if (listing.status !== 'active') {
    throw ApiError.badRequest('This listing is not accepting new offers');
  }
  if (listing.farmer_id === buyerId) {
    throw ApiError.badRequest('You cannot make an offer on your own listing');
  }

  // Available quantity = total quantity minus everything already accepted.
  // The listing row is not mutated; it always describes the original harvest.
  const acceptedQuantity = await sumAcceptedQuantity(listingId);
  const available = Number((Number(listing.quantity_mann) - acceptedQuantity).toFixed(2));

  if (available <= 0) {
    throw ApiError.badRequest('This listing has already been sold out');
  }
  if (payload.quantity_mann > available) {
    throw ApiError.badRequest(`Only ${available} mann is still available on this listing`);
  }

  // Friendly check first; the database partial unique index is the real guard.
  const { data: existingPending, error: pendingError } = await supabase
    .from('offers')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .eq('status', 'pending')
    .maybeSingle();

  if (pendingError) throw ApiError.internal('Could not check your offers', pendingError);
  if (existingPending) {
    throw ApiError.conflict('You already have a pending offer on this listing');
  }

  const { data, error } = await supabase
    .from('offers')
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      offered_price_per_mann: payload.offered_price_per_mann,
      quantity_mann: payload.quantity_mann,
      message: payload.message ?? null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw ApiError.conflict('You already have a pending offer on this listing');
    }
    throw ApiError.internal('Could not submit your offer', error);
  }

  return { ...data, listing };
}

export async function listMyOffers(buyerId) {
  const { data, error } = await supabase
    .from('offers')
    .select(
      '*, listing:crop_listings!offers_listing_id_fkey(id, crop_name, category, district, price_per_mann, quantity_mann, status, farmer:profiles!crop_listings_farmer_id_fkey(full_name, district, phone))',
    )
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });

  if (error) throw ApiError.internal('Could not load your offers', error);
  return data ?? [];
}

export async function listOffersForListing(listingId, farmerId) {
  const { data: listing, error: listingError } = await supabase
    .from('crop_listings')
    .select('id, farmer_id')
    .eq('id', listingId)
    .maybeSingle();

  if (listingError) throw ApiError.internal('Could not load this listing', listingError);
  if (!listing) throw ApiError.notFound('Listing not found');
  if (listing.farmer_id !== farmerId) {
    throw ApiError.forbidden('You can only see offers on your own listings');
  }

  const { data, error } = await supabase
    .from('offers')
    .select('*, buyer:profiles!offers_buyer_id_fkey(id, full_name, district, phone, buyer_type)')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });

  if (error) throw ApiError.internal('Could not load offers for this listing', error);
  return data ?? [];
}

/**
 * ACCEPTING AN OFFER - the core business rule of MandiLink.
 *
 * 1. Only the farmer who owns the listing may accept (403 otherwise).
 * 2. Only a pending offer may be accepted.
 * 3. The listing quantity is the maximum that can ever be sold. We add up the
 *    quantities of ALL accepted offers, including the one being accepted now.
 * 4. If that total reaches the listing quantity, the harvest is fully sold:
 *      - the listing becomes 'sold' (so it disappears from active browsing),
 *      - every other PENDING offer on that listing is rejected, so no buyer is
 *        left waiting for stock that no longer exists.
 * 5. If quantity remains, the listing stays 'active' and other pending offers
 *    are kept, because the farmer can still sell the rest.
 *
 * Note: Supabase JS has no multi-statement transactions, so a Postgres RPC
 * would be the production-grade way to make this fully atomic. The status
 * guard below (update ... where status = 'pending') prevents double accepts.
 */
export async function acceptOffer(offerId, farmerId) {
  const offer = await getOfferWithListing(offerId);

  if (offer.listing.farmer_id !== farmerId) {
    throw ApiError.forbidden('You can only respond to offers on your own listings');
  }
  if (offer.status !== 'pending') {
    throw ApiError.badRequest('Only pending offers can be accepted');
  }

  // Conditional update: if another request accepted it first, this matches 0 rows.
  const { data: accepted, error: acceptError } = await supabase
    .from('offers')
    .update({ status: 'accepted' })
    .eq('id', offerId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (acceptError) throw ApiError.internal('Could not accept this offer', acceptError);
  if (!accepted) throw ApiError.badRequest('This offer is no longer pending');

  const totalQuantity = Number(offer.listing.quantity_mann);
  const acceptedQuantity = await sumAcceptedQuantity(offer.listing.id);
  const soldOut = acceptedQuantity >= totalQuantity;

  let rejectedOtherOffers = false;

  if (soldOut) {
    const { error: listingError } = await supabase
      .from('crop_listings')
      .update({ status: 'sold', updated_at: new Date().toISOString() })
      .eq('id', offer.listing.id);

    if (listingError) throw ApiError.internal('Offer accepted but listing update failed', listingError);

    const { error: rejectError } = await supabase
      .from('offers')
      .update({ status: 'rejected' })
      .eq('listing_id', offer.listing.id)
      .eq('status', 'pending');

    if (rejectError) throw ApiError.internal('Offer accepted but other offers could not be rejected', rejectError);

    rejectedOtherOffers = true;
  }

  return {
    offer: accepted,
    listing_status: soldOut ? 'sold' : offer.listing.status,
    remaining_quantity: Math.max(Number((totalQuantity - acceptedQuantity).toFixed(2)), 0),
    rejected_other_offers: rejectedOtherOffers,
  };
}

export async function rejectOffer(offerId, farmerId) {
  const offer = await getOfferWithListing(offerId);

  if (offer.listing.farmer_id !== farmerId) {
    throw ApiError.forbidden('You can only respond to offers on your own listings');
  }
  if (offer.status !== 'pending') {
    throw ApiError.badRequest('Only pending offers can be rejected');
  }

  const { data, error } = await supabase
    .from('offers')
    .update({ status: 'rejected' })
    .eq('id', offerId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) throw ApiError.internal('Could not reject this offer', error);
  if (!data) throw ApiError.badRequest('This offer is no longer pending');
  return data;
}

export async function withdrawOffer(offerId, buyerId) {
  const { data: offer, error: fetchError } = await supabase
    .from('offers')
    .select('id, buyer_id, status')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchError) throw ApiError.internal('Could not load this offer', fetchError);
  if (!offer) throw ApiError.notFound('Offer not found');
  if (offer.buyer_id !== buyerId) {
    throw ApiError.forbidden('You can only withdraw your own offers');
  }
  if (offer.status !== 'pending') {
    throw ApiError.badRequest('Only pending offers can be withdrawn');
  }

  const { data, error } = await supabase
    .from('offers')
    .update({ status: 'withdrawn' })
    .eq('id', offerId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) throw ApiError.internal('Could not withdraw this offer', error);
  if (!data) throw ApiError.badRequest('This offer is no longer pending');
  return data;
}
