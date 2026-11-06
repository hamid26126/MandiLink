import * as offerService from '../services/offerService.js';
import { sendSuccess } from '../utils/response.js';

export async function create(req, res) {
  const data = await offerService.createOffer(req.params.id, req.user.id, req.body);
  return sendSuccess(res, data, 'Offer submitted successfully', 201);
}

export async function mine(req, res) {
  const data = await offerService.listMyOffers(req.user.id);
  return sendSuccess(res, data, 'Your offers loaded');
}

export async function forListing(req, res) {
  const data = await offerService.listOffersForListing(req.params.id, req.user.id);
  return sendSuccess(res, data, 'Offers loaded');
}

export async function accept(req, res) {
  const data = await offerService.acceptOffer(req.params.id, req.user.id);
  return sendSuccess(res, data, 'Offer accepted');
}

export async function reject(req, res) {
  const data = await offerService.rejectOffer(req.params.id, req.user.id);
  return sendSuccess(res, data, 'Offer rejected');
}

export async function withdraw(req, res) {
  const data = await offerService.withdrawOffer(req.params.id, req.user.id);
  return sendSuccess(res, data, 'Offer withdrawn');
}
