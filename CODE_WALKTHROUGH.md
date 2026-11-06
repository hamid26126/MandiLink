# MandiLink - Code Walkthrough

This document is written for presenting the project. It explains how a request
travels through the code, how authentication and roles work, how the offer
acceptance business rule works, and which file does what.

---

## 1. The big picture

MandiLink has three parts:

```
React frontend  --->  Express backend  --->  Supabase
(port 5173)           (port 5000)            (PostgreSQL + Auth)
```

- The **frontend** only knows our API URL. It has no Supabase keys.
- The **backend** is a standalone REST API under `/api/v1`. It is the only thing
  that talks to Supabase, using the service-role key from `backend/.env`.
- **Supabase** stores users (Auth) and application data (PostgreSQL).

Why this matters for the future: the mobile app can call the same backend, with
the same tokens and the same endpoints. Nothing needs to be rewritten.

---

## 2. Request lifecycle

Every protected request goes through the same pipeline:

```
HTTP request
   |
   v
route            (URL + middleware chain)               src/routes/*
   |
   v
authenticate     (verify JWT, load profile, set req.user) middleware/authenticate.js
   |
   v
authorize(...)   (check role: farmer / buyer)             middleware/authorize.js
   |
   v
validate(schema) (zod: params / query / body)             middleware/validate.js
   |
   v
controller       (read req, call service, send JSON)      controllers/*
   |
   v
service          (business rules + Supabase queries)      services/*
   |
   v
Supabase         (service-role DB client, anon auth client) config/supabase.js
   |
   v
JSON response    (success or ApiError via errorHandler)
```

### Example: `POST /api/v1/listings` (farmer creates a listing)

1. `routes/listing.routes.js` matches the URL.
2. `authenticate` reads `Authorization: Bearer <jwt>`, calls
   `authClient.auth.getUser(token)`, loads the row from `profiles` with the
   service-role client, and sets
   `req.user = { id, role, full_name, district, ... }`.
3. `authorize('farmer')` blocks buyers with **403**.
4. `validate({ body: createListingSchema })` checks crop, category, quantity,
   price, district, quality with zod. Invalid input becomes **400** with
   per-field messages.
5. `listingController.create` calls `listingService.createListing(req.user.id, req.body)`.
6. The service inserts into `crop_listings` with `farmer_id = req.user.id`.
7. The controller sends `{ success: true, data: listing, message: "..." }`.

If anything throws, `asyncHandler` forwards the error to `errorHandler`, which
returns the standard `{ success: false, error: { message, details } }` shape.

---

## 3. How registration works

Frontend `POST /api/v1/auth/register` (Register page sends name, email, password,
phone, district, role, optional buyer_type).

```
route (authLimiter + zod validation)
  -> authController.register
    -> authService.register
       1. supabase.auth.admin.createUser({ email, password, email_confirm: true })
       2. insert into profiles (id = auth user id, role, name, phone, district)
       3. if the profile insert fails -> admin.deleteUser(id)   [rollback]
       4. authClient.auth.signInWithPassword -> access_token + refresh_token
       5. return { user: profile, session }
  -> 201 Created
```

Then the frontend `AuthContext.persistSession` stores the profile and tokens in
`localStorage` and navigates to `/farmer` or `/buyer` based on `user.role`.

Key points:

- `role: 'admin'` is rejected by the zod enum, so nobody can self-register as admin.
- Supabase Auth stores the password hash. Our database never stores passwords.
- The rollback prevents an orphan auth user that can log in but has no profile.

---

## 4. How login, JWT and role authorization work

### Login

```
POST /auth/login { email, password }
  -> authClient.auth.signInWithPassword
  -> load profiles row by auth user id (service-role client)
  -> return { user: profile, session: { access_token, refresh_token, ... } }
```

The role is stored in **our** `profiles` table, not in the token's metadata.
That is why `authenticate` loads the profile on every request: the backend always
uses the current role from the database.

### Authenticated request

1. Frontend Axios request interceptor reads the token from `localStorage` and adds
   `Authorization: Bearer <access_token>`.
2. Backend `authenticate`:
   - rejects a missing/malformed header with **401**,
   - verifies the token with `authClient.auth.getUser(token)`,
   - loads the matching profile,
   - attaches `req.user` and `req.accessToken`.
3. `authorize('farmer')` or `authorize('buyer')` returns **403** if the role is wrong.

**401 vs 403:** 401 means "we do not know who you are" (not logged in / bad token).
403 means "we know who you are, but this action is not allowed for your role".

### Token refresh

Access tokens expire. The frontend `api/client.js` response interceptor:

1. sees a 401,
2. calls `POST /auth/refresh` once with the refresh token (shared promise, so
   parallel 401s trigger only one refresh),
3. stores the new tokens and retries the original request,
4. if refresh fails, clears local storage, fires `mandilink:session-expired`, and
   `AuthContext` logs the user out.

### Ownership checks (separate from roles)

Roles are not enough: farmer A must not edit farmer B's listing. Every service
that mutates data checks ownership:

| Action | Check in service |
|--------|------------------|
| Update/delete listing | `listing.farmer_id === req.user.id` |
| See offers for a listing | `listing.farmer_id === req.user.id` |
| Accept/reject offer | offer's listing belongs to the farmer |
| Withdraw offer | `offer.buyer_id === req.user.id` |

Wrong ownership produces **403**; not found produces **404**.

---

## 5. How an offer gets accepted (the core business logic)

Implemented in `backend/src/services/offerService.js` (`acceptOffer`).

Rules recap:

- `crop_listings.quantity_mann` is the **total** quantity, never decremented.
- Remaining quantity = total minus the sum of quantities of **accepted** offers.
- A buyer cannot offer more than the remaining quantity.
- A buyer can have only one **pending** offer per listing.

### Step by step

1. Load the offer together with its listing.
2. If the listing's `farmer_id` is not the logged-in farmer -> **403**.
3. If the offer is not `pending` -> **400**.
4. Update the offer to `accepted` with a guard:
   `UPDATE offers SET status='accepted' WHERE id=? AND status='pending'`.
   If zero rows change, someone else already processed it.
5. Sum the quantities of all accepted offers on that listing.
6. Compare the sum with `listing.quantity_mann`:
   - **Fully taken:** set the listing to `sold`, then set every other `pending`
     offer on that listing to `rejected`. (Example: total 110 mann, accepted
     offers now total 110.)
   - **Quantity remains:** keep the listing `active`; other pending offers stay
     pending so the farmer can sell the rest. (Example: total 110, accepted
     total 40, remaining 70.)
7. Return `{ offer, listing_status, remaining_quantity, rejected_other_offers }`.

### Why reject other offers only when sold out?

If 110 mann are listed and one buyer takes 40, there are still 70 mann left to
sell. Rejecting everyone else would lose the farmer potential buyers. Once the
full 110 is committed, remaining pending offers can never be fulfilled, so they
are rejected to avoid leaving buyers waiting.

### Race condition note

Supabase JS cannot run a multi-statement transaction. The conditional update in
step 4 stops the same offer being accepted twice, but a fully atomic accept
(especially across several tables) would be implemented as a Postgres function
(RPC) in production. This is a good, honest answer for the viva.

---

## 6. How the sample market comparison works

- `mandi_prices` holds **sample** rows: crop name, district, price per mann, date.
- `GET /listings/:id` calls `listingService.getListingById`, which looks up the
  latest sample price for the listing's crop and district.
- The response includes `market_price` and `market_comparison`
  (difference and percent difference).
- The farmer's Create/Edit Listing form calls `GET /market-prices` while typing
  the crop and district, and shows the sample rate next to the asking price.
- The UI labels this data as **"Sample data"** because it is not a live mandi feed.

---

## 7. Key files (one line each)

### Root

| File | Purpose |
|------|---------|
| `README.md` | Setup, API reference, decisions, roadmap |
| `CODE_WALKTHROUGH.md` | This presentation guide |
| `.gitignore` | Ignores `node_modules`, `.env`, build output |

### Backend

| File | Purpose |
|------|---------|
| `backend/db/schema.sql` | Tables, enums, checks, indexes, trigger, RLS |
| `backend/db/seed.js` | Idempotent demo users, profiles, listings, offers, prices |
| `backend/src/server.js` | Starts the HTTP server, graceful shutdown, process guards |
| `backend/src/app.js` | Express app: helmet, CORS, JSON, routes, 404, error handler |
| `backend/src/config/env.js` | Loads and validates required environment variables |
| `backend/src/config/supabase.js` | Creates the service-role Supabase client |
| `backend/src/routes/index.js` | Mounts all `/api/v1` resource routers |
| `backend/src/routes/auth.routes.js` | Register/login/refresh/logout/me URLs |
| `backend/src/routes/listing.routes.js` | Listing CRUD + nested listing-offer routes |
| `backend/src/routes/offer.routes.js` | Accept/reject/withdraw/my-offers URLs |
| `backend/src/routes/dashboard.routes.js` | Farmer and buyer dashboard URLs |
| `backend/src/routes/market.routes.js` | Public sample market prices URL |
| `backend/src/controllers/authController.js` | Thin: calls authService, sends response |
| `backend/src/controllers/listingController.js` | Thin listing handlers |
| `backend/src/controllers/offerController.js` | Thin offer handlers |
| `backend/src/controllers/dashboardController.js` | Thin dashboard handlers |
| `backend/src/controllers/marketController.js` | Thin market handler |
| `backend/src/services/authService.js` | Register rollback, login, refresh, logout, profile |
| `backend/src/services/listingService.js` | Listing queries, filters, ownership, market comparison |
| `backend/src/services/offerService.js` | Offer rules and the accept/reject/withdraw logic |
| `backend/src/services/dashboardService.js` | Aggregates counts and recent activity |
| `backend/src/services/marketService.js` | Sample market price queries |
| `backend/src/middleware/authenticate.js` | Verifies JWT + loads profile into `req.user` |
| `backend/src/middleware/authorize.js` | Role gate (403 on wrong role) |
| `backend/src/middleware/validate.js` | zod validation for params/query/body |
| `backend/src/middleware/errorHandler.js` | Central JSON error responses, hides internals in production |
| `backend/src/middleware/notFound.js` | 404 for unknown routes |
| `backend/src/middleware/rateLimiter.js` | General and auth-specific rate limits |
| `backend/src/validators/*.js` | zod schemas (auth, listing, offer, market, common) |
| `backend/src/utils/ApiError.js` | Error class carrying HTTP status + details |
| `backend/src/utils/asyncHandler.js` | Forwards async errors to `next()` |
| `backend/src/utils/response.js` | Standard `{ success, data, message }` helper |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/main.jsx` | Mounts React with Router, AuthProvider, ToastProvider |
| `frontend/src/App.jsx` | Renders the route table |
| `frontend/src/routes/AppRoutes.jsx` | Public pages plus role-protected route groups |
| `frontend/src/api/client.js` | Axios instance, token header, 401 -> refresh -> retry |
| `frontend/src/api/auth.js` | Register/login/logout/me calls |
| `frontend/src/api/listings.js` | Listing API calls |
| `frontend/src/api/offers.js` | Offer API calls |
| `frontend/src/api/dashboard.js` | Dashboard API calls |
| `frontend/src/api/market.js` | Sample market price calls |
| `frontend/src/context/AuthContext.jsx` | Stores user/tokens, validates session on load |
| `frontend/src/context/ToastContext.jsx` | Small success/error toast system |
| `frontend/src/components/ProtectedRoute.jsx` | Login + role guard, redirects wrong roles |
| `frontend/src/components/PublicOnlyRoute.jsx` | Keeps logged-in users off login/register |
| `frontend/src/components/Navbar.jsx` | Role-aware navigation + logout |
| `frontend/src/components/Layout.jsx` | Navbar, page outlet, footer |
| `frontend/src/components/ListingCard.jsx` | Reusable listing summary card |
| `frontend/src/components/StatusBadge.jsx` | Coloured status pill |
| `frontend/src/components/StatCard.jsx` | Dashboard statistic card |
| `frontend/src/components/Pagination.jsx` | Previous/next pagination |
| `frontend/src/components/EmptyState.jsx` | Friendly no-data state |
| `frontend/src/components/LoadingSpinner.jsx` | Loading indicator |
| `frontend/src/components/PageHeader.jsx` | Page title/description/action |
| `frontend/src/components/Logo.jsx` | Small wheat/leaf SVG mark |
| `frontend/src/pages/Landing.jsx` | Marketing page + sample prices |
| `frontend/src/pages/Login.jsx` | Login form |
| `frontend/src/pages/Register.jsx` | Role selector + signup form |
| `frontend/src/pages/NotFound.jsx` | 404 page |
| `frontend/src/pages/farmer/FarmerDashboard.jsx` | Farmer stat cards + recent offers |
| `frontend/src/pages/farmer/MyListings.jsx` | Farmer listing table/cards with edit/delete |
| `frontend/src/pages/farmer/ListingForm.jsx` | Create/edit listing + market hint + voice placeholder |
| `frontend/src/pages/farmer/OffersReceived.jsx` | Offers per listing with accept/reject |
| `frontend/src/pages/buyer/BuyerDashboard.jsx` | Buyer stats, offers, district listings |
| `frontend/src/pages/buyer/BrowseCrops.jsx` | Search, filters, sorting, pagination |
| `frontend/src/pages/buyer/ListingDetail.jsx` | Listing + market comparison + Make Offer form |
| `frontend/src/pages/buyer/MyOffers.jsx` | Buyer offers with statuses and withdraw |
| `frontend/src/utils/format.js` | Price/date/status formatting, error extraction |
| `frontend/src/utils/storage.js` | localStorage token/profile helpers |
| `frontend/src/utils/roles.js` | Role -> dashboard path |

---

## 8. A 5-minute demo script

1. Open <http://localhost:5173> and show the landing page, tagline and sample
   market prices (labelled sample data).
2. Log in as **Ahmed Raza** (`ahmed.farmer@mandilink.pk` / `Demo@1234`).
3. Show the farmer dashboard statistics and recent offers.
4. Go to **My Listings -> Create listing**. Type `Wheat` and district `Okara`.
   Point out the sample market rate appearing next to the price, and the disabled
   **"Voice Assistant (coming soon)"** placeholder.
5. Log out and log in as **Sana Traders**
   (`sana.buyer@mandilink.pk` / `Demo@1234`).
6. **Browse Crops**: search/filter by category and district, open a listing, show
   the market comparison, and send an offer.
7. Go to **My Offers** and show the pending badge.
8. Log back in as Ahmed, open **Offers Received**, accept the offer. Explain the
   quantity logic: if the accepted quantity uses up the listing, the status becomes
   `sold` and other pending offers are rejected.
9. Show the role guard: as a buyer, open `/farmer` in the address bar; the app
   redirects to the buyer dashboard. Explain that the API would also return 403.
10. Show the API health check at <http://localhost:5000/health> and the README API
    table.

---

## 9. Likely viva questions

**Why does the frontend never talk to Supabase?**
So the backend is the single source of truth, the service-role key never reaches
the browser, and the mobile app can reuse exactly the same auth and data flows.

**Why enable RLS but create no policies?**
The backend uses the service role, which bypasses RLS. With no policies, the public
anon/authenticated keys cannot read or write any table directly. Every access goes
through our API and its role/ownership checks.

**Why load the profile on every request?**
The role lives in the `profiles` table, and ownership checks need the current
profile. `authClient.auth.getUser` also verifies the token is still valid.

**Why are there two Supabase clients?**
`config/supabase.js` exports `supabase` (service-role key, all database queries)
and `authClient` (anon key, sign-in/refresh/token checks). `supabase-js` remembers
the signed-in session on the client object. If login ran on the admin client, later
PostgREST queries would use the user's JWT instead of the service-role key; RLS is
enabled with no policies, so those queries would return zero rows with no error.
Isolating the session on `authClient` keeps the admin client privileged.

**What is the difference between 401 and 403 here?**
401 = missing/invalid token. 403 = valid user with the wrong role or insufficient
ownership.

**How do you stop a farmer from editing another farmer's listing?**
`authorize('farmer')` handles the role; `listingService.assertOwnership` compares
`listing.farmer_id` with `req.user.id` and throws 403 otherwise. The role alone is
not enough, which is why the check is in the service.

**Why is quantity not reduced when an offer is accepted?**
The listing row describes the original harvest. Remaining quantity is derived from
accepted offers, which keeps the data auditable and makes partial sales possible.

**How is "sold" determined?**
When the sum of accepted offer quantities is greater than or equal to the listing's
total quantity. Then the listing becomes `sold` and remaining pending offers are
rejected.

**Why a partial unique index on offers?**
It enforces "one pending offer per buyer per listing" at the database level, even if
two requests race past the JavaScript check.

**What happens when the access token expires?**
The Axios interceptor calls `/auth/refresh` once, updates localStorage, retries the
request, and logs the user out if refreshing fails.

**Why use zod both on the client and the server?**
The client validates for quick feedback; the server schema is the real authority
and protects the API from any client (including curl and the future mobile app).

**How would you make the accept flow fully atomic?**
Move the accept logic into a PostgreSQL function and call it with `supabase.rpc`,
so all updates happen in one transaction. Mention this as future work.

**Why is there no business logic in routes?**
Routes only wire URLs to middleware and controllers. Services hold the rules, which
makes them testable and reusable by any transport (web, mobile, tests).
