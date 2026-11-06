import * as listingService from '../services/listingService.js';
import { sendSuccess } from '../utils/response.js';

export async function list(req, res) {
  const data = await listingService.listListings(req.query);
  return sendSuccess(res, data, 'Listings loaded');
}

export async function getOne(req, res) {
  const data = await listingService.getListingById(req.params.id);
  return sendSuccess(res, data, 'Listing loaded');
}

export async function create(req, res) {
  const data = await listingService.createListing(req.user.id, req.body);
  return sendSuccess(res, data, 'Listing created successfully', 201);
}

export async function update(req, res) {
  const data = await listingService.updateListing(req.params.id, req.user.id, req.body);
  return sendSuccess(res, data, 'Listing updated successfully');
}

export async function remove(req, res) {
  await listingService.deleteListing(req.params.id, req.user.id);
  return sendSuccess(res, null, 'Listing deleted successfully');
}

export async function mine(req, res) {
  const data = await listingService.listMyListings(req.user.id);
  return sendSuccess(res, data, 'Your listings loaded');
}
