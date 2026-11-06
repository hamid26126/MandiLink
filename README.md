# MandiLink

**Connecting Pakistani Farmers Directly to Markets**

MandiLink is a marketplace that connects Pakistani farmers directly with retailers,
wholesalers and bulk buyers. Farmers list their harvest with a quantity and asking
price; buyers search, compare with a sample mandi reference price, and send offers.
The farmer accepts or rejects those offers without a middleman taking a cut.

This repository is **Milestone 1**: a complete web application (React frontend,
Express REST API, Supabase PostgreSQL database). Later milestones (mobile app, voice
assistant, admin tools, payments, transport) are designed for but not implemented.

---

## 1. What is in this repository

```
MandiLink/
  README.md                  this file
  CODE_WALKTHROUGH.md        beginner-friendly explanation for the demo/viva
  .gitignore
  backend/                   standalone REST API (no frontend dependency)
    package.json
    .env.example
    db/schema.sql            run this in the Supabase SQL Editor
    db/seed.js               npm run seed (demo users, listings, offers, prices)
    src/
      server.js              starts the HTTP server
      app.js                 Express app, global middleware, route mounting
      config/                env validation + Supabase admin and auth clients
      routes/                URL -> middleware chain -> controller
      controllers/           read request, call service, send response
      services/              business logic + ALL Supabase queries
      middleware/            authenticate, authorize, validate, errors, 404, rate limits
      validators/            zod request schemas
      utils/                 ApiError, asyncHandler, response helper
  frontend/                  React web app (talks ONLY to the backend)
    package.json
    .env.example
    src/
      api/                   Axios instance + one module per resource
      context/               AuthContext (tokens/profile) + ToastContext
      components/            Navbar, cards, badges, pagination, guards...
      pages/                 landing, auth, farmer area, buyer area
      routes/                route table with role protection
      utils/                 formatting, localStorage, role helpers
```

The backend is deliberately independent. A future React Native app can call the same
`/api/v1` endpoints with the same tokens; nothing in the API imports or serves the
web frontend.

---

## 2. Architecture

```
                  HTTPS + JSON (Bearer JWT)
  React (Vite)  ------------------------------->  Express API (port 5000)
  port 5173                                        |
  - never sees Supabase keys                       | service-role key (server only)
  - Axios attaches access token                    v
  - 401 -> refresh once -> retry            Supabase
                                            - Auth (users, JWT, refresh)
                                            - PostgreSQL (profiles, listings,
                                              offers, mandi_prices)
```

Request lifecycle:

```
route -> authenticate / authorize / validate -> controller -> service -> Supabase -> response
```

Response shape (success):

```json
{ "success": true, "data": {}, "message": "OK" }
```

Response shape (failure):

```json
{ "success": false, "error": { "message": "Validation failed", "details": [] } }
```

---

## 3. Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 18, Vite 5, React Router 6, Axios, Tailwind CSS 3 |
| Backend    | Node.js (ES modules), Express 4 |
| Database   | Supabase PostgreSQL |
| Auth       | Supabase Auth (email/password + JWT + refresh tokens) |
| Validation | zod |
| Security   | helmet, configurable cors, express-rate-limit, RLS with no policies |

---

## 4. Setup (do these in order)

### 4.1 Prerequisites

- Node.js 18 or newer (`node -v`)
- A free Supabase project

### 4.2 Create the database

1. Open your Supabase project.
2. Go to **SQL Editor -> New query**.
3. Paste the entire contents of `backend/db/schema.sql` and click **Run**.

This creates the enums, tables, indexes, CHECK constraints, the `updated_at`
trigger, and enables Row Level Security. RLS is intentionally enabled with **no
policies**: only the backend's service-role key can read/write the tables. The
comment at the top of `schema.sql` explains this security decision.

### 4.3 Configure the backend

Copy `backend/.env.example` to `backend/.env` and fill in the values from
**Supabase Dashboard -> Project Settings -> API**:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
NODE_ENV=development
```

**Never commit `.env` and never expose the service-role key to the browser.**

### 4.4 Configure the frontend

Copy `frontend/.env.example` to `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api/v1
```

### 4.5 Install dependencies

From the repository root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 4.6 Seed demo data

```bash
cd backend
npm run seed
```

The seed is safe to re-run. It creates demo auth users, profiles, 8 listings, 5
offers and 10 sample market prices. Re-running resets the offers on the demo
listings to the original demo state.

### 4.7 Run the app

Open two terminals:

```bash
# Terminal 1 - API on http://localhost:5000
cd backend
npm run dev

# Terminal 2 - web app on http://localhost:5173
cd frontend
npm run dev
```

Open <http://localhost:5173>.

Health check: <http://localhost:5000/health>

---

## 5. Demo accounts

All demo accounts use the password **`Demo@1234`**.

| Role   | Name             | District   | Email |
|--------|------------------|------------|-------|
| Farmer | Ahmed Raza       | Okara      | `ahmed.farmer@mandilink.pk` |
| Farmer | Bilal Khan       | Sahiwal    | `bilal.farmer@mandilink.pk` |
| Buyer  | Sana Traders     | Lahore     | `sana.buyer@mandilink.pk` |
| Buyer  | Usman Wholesale  | Faisalabad | `usman.buyer@mandilink.pk` |

New accounts can also be created from `/register` as a farmer or buyer.

---

## 6. API reference

Base URL: `http://localhost:5000/api/v1`

Authentication: `Authorization: Bearer <access_token>` on protected routes.
Roles in the table are enforced by middleware **and** ownership is re-checked in
the services (a farmer cannot edit another farmer's listing even with a valid token).

### Auth

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/auth/register` | Public | Create farmer/buyer auth user + profile, return session |
| POST | `/auth/login` | Public | Email/password -> access token, refresh token, profile |
| POST | `/auth/refresh` | Public | Exchange refresh token for a new session |
| POST | `/auth/logout` | Logged in | Revoke the current Supabase session (best effort) |
| GET | `/auth/me` | Logged in | Current user profile including role |

`admin` cannot be registered through the API. The role exists in the database for
the future admin panel.

### Listings

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/listings` | Logged in | Search, filter, sort and paginate listings |
| GET | `/listings/mine` | Farmer | The logged-in farmer's listings |
| GET | `/listings/:id` | Logged in | Listing + farmer details + sample market comparison |
| POST | `/listings` | Farmer | Create a listing |
| PUT | `/listings/:id` | Farmer (owner) | Update a listing |
| DELETE | `/listings/:id` | Farmer (owner) | Delete a listing (offers cascade) |

`GET /listings` query parameters:

| Parameter | Example | Notes |
|-----------|---------|-------|
| `search` | `wheat` | partial, case-insensitive crop name |
| `category` | `wheat\|rice\|vegetable\|fruit\|other` | exact |
| `district` | `Okara` | partial, case-insensitive |
| `price_min` / `price_max` | `2000` / `5000` | inclusive |
| `status` | `active\|sold\|closed` | optional |
| `sort` | `newest\|price_asc\|price_desc` | default `newest` |
| `page` / `limit` | `1` / `9` | limit max 50 |

### Offers

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/listings/:id/offers` | Buyer | Make an offer on an active listing |
| GET | `/listings/:id/offers` | Farmer (owner) | Offers received on one listing |
| GET | `/offers/mine` | Buyer | Offers the buyer has sent |
| PATCH | `/offers/:id/accept` | Farmer (owner) | Accept a pending offer |
| PATCH | `/offers/:id/reject` | Farmer (owner) | Reject a pending offer |
| PATCH | `/offers/:id/withdraw` | Buyer (owner) | Withdraw a pending offer |

Rules:

- A buyer can have only one **pending** offer per listing (also enforced by a
  partial unique index in the database).
- An offer cannot exceed the remaining quantity. Remaining quantity =
  `listing.quantity_mann - SUM(accepted offers quantity)`.
- Offers are only allowed on `active` listings.
- A buyer cannot offer on their own listing.

### Dashboards

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/dashboard/farmer` | Farmer | Active listings, pending/accepted offers, sold quantity, recent offers |
| GET | `/dashboard/buyer` | Buyer | Pending/accepted/rejected counts, recent offers, newest listings in their district |

### Market prices and health

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/market-prices?crop_name=&district=` | Public | SAMPLE reference prices |
| GET | `/health` | Public | API health check |
| GET | `/api/v1/health` | Public | Versioned health check |

The market endpoint is public by design so the landing page can show sample prices
before login; it exposes no private data. The frontend still calls it through our
backend, never Supabase.

### Quick curl smoke test

```bash
# Register a buyer
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test.buyer@example.com","password":"Demo@1234","full_name":"Test Buyer","phone":"+92 300 0000000","role":"buyer","district":"Lahore","buyer_type":"retailer"}'

# Log in (copy access_token from the response)
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sana.buyer@mandilink.pk","password":"Demo@1234"}'

# Browse listings
curl http://localhost:5000/api/v1/listings?status=active \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Make an offer on a listing id
curl -X POST http://localhost:5000/api/v1/listings/<LISTING_ID>/offers \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"offered_price_per_mann":4000,"quantity_mann":25,"message":"Sample offer"}'
```

Wrong-role requests (for example a buyer calling `GET /listings/mine`) return
**403** with `{ success: false, error: { message: "This action requires a farmer account" } }`.

---

## 7. Database model

```
auth.users (Supabase)
   | 1:1
profiles (role, full_name, phone, district, buyer_type)
   | 1:N (farmer_id)
crop_listings (crop, category, quantity, price, district, quality, status)
   | 1:N (listing_id)
offers (offered price, quantity, message, status)
   ^ buyer_id -> profiles

mandi_prices (crop_name, district, price_per_mann, recorded_on)   [SAMPLE DATA]
```

Important modelling decision: `crop_listings.quantity_mann` is the **total**
harvest quantity. It is not decremented when an offer is accepted. Remaining
quantity is always derived from accepted offers. This keeps listing history
consistent and makes the accept logic easy to reason about.

Enums: `user_role`, `listing_status`, `offer_status`.

CHECK constraints: positive quantity and price, valid category/quality/status,
and `buyer_type` only for buyers. Indexes cover the filters and dashboards.

### Offer acceptance logic (summary)

1. Only the owning farmer can accept.
2. Only a pending offer can be accepted.
3. Sum the quantities of all accepted offers, including this new acceptance.
4. If the sum reaches the listing quantity:
   - mark the listing `sold`,
   - reject every other pending offer on that listing.
5. If quantity remains, keep the listing `active` and leave other pending offers
   alone so the farmer can sell the rest.

See `backend/src/services/offerService.js` for the fully commented implementation.

---

## 8. Design decisions (and why)

1. **All auth goes through the Express API.** The frontend never imports
   `@supabase/supabase-js` and has no Supabase keys. This makes the backend the
   single source of truth and lets the mobile app reuse identical auth flows.
2. **Service-role key only on the backend.** RLS is enabled on every table with no
   policies, so the anon/authenticated Supabase keys cannot access data directly.
   The service role bypasses RLS. Because Supabase cannot enforce "a farmer may
   only edit their own listing" automatically, ownership checks live in services.
   The backend uses **two clients**: a privileged service-role client for all
   database queries, and a separate anon-key client for password sign-in, token
   refresh, and token verification. Signing in makes `supabase-js` remember the
   user session on that client instance, and PostgREST would then send the user's
   JWT instead of the service-role key. With RLS enabled and no policies, every
   query would silently return zero rows. Keeping sessions out of the admin client
   prevents that bug.
3. **Layered backend.** Routes only define URLs and middleware; controllers stay
   thin; services contain business logic and all Supabase queries. This is the
   structure the professor can trace in `CODE_WALKTHROUGH.md`.
4. **Tokens in localStorage.** Acceptable for this milestone. The Axios
   interceptor attaches the access token and, on a 401, refreshes once with the
   refresh token before logging the user out. For a hardened production release,
   httpOnly cookies would be preferable.
5. **Quantity model.** Total quantity stays unchanged; remaining quantity is
   computed. This makes partial sales possible and keeps history auditable.
6. **Accept flow is not a single transaction.** Supabase JS does not expose
   multi-statement transactions. The conditional `WHERE status = 'pending'`
   update prevents double accepts; a future version could move the whole accept
   flow into a Postgres function (RPC) for strict atomicity.
7. **Sample market prices.** `mandi_prices` is clearly labelled sample data. A real
   market-data feed is future work. The comparison is a simple difference and
   percentage against the latest sample row for the same crop/district.
8. **Admin role exists but has no features yet.** It cannot be self-registered.
9. **`buyer_type` is optional** for buyers (retailer / wholesaler / bulk buyer) and
   is forced to `NULL` for farmers both in validation and by a database CHECK.
10. **Seed data uses fixed UUIDs** and resets demo offers on re-run so the demo is
    reproducible.
11. **Tailwind CSS 3** is pinned because its PostCSS configuration is stable and
    explicit; the setup in this repo has been built successfully with the
    installed versions.
12. **The monorepo root is this folder** (`MandiLink/`), containing `backend/` and
    `frontend/`.
13. **`SUPABASE_ANON_KEY` is required.** It powers the dedicated auth client used
    for sign-in, refresh, and token verification. Database queries always go
    through the separate service-role client, which never holds a user session.

---

## 9. Scripts

| Location | Command | What it does |
|----------|---------|--------------|
| backend | `npm run dev` | Start API with nodemon on port 5000 |
| backend | `npm start` | Start API with plain Node |
| backend | `npm run seed` | Create/reset demo data in Supabase |
| frontend | `npm run dev` | Start Vite dev server on port 5173 |
| frontend | `npm run build` | Production build into `frontend/dist` |
| frontend | `npm run preview` | Preview the production build |

---

## 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| `Missing required environment variables` | Copy `backend/.env.example` to `.env` and fill it |
| Seed says relation/tables missing | Run `backend/db/schema.sql` in the Supabase SQL Editor first |
| Seed says user already exists | It should reuse users; check the same Supabase project is configured |
| API returns 401 immediately after login | Make sure backend and frontend use the same Supabase project; log in again |
| Browser blocked by CORS | Set `CLIENT_ORIGIN` in `backend/.env` to the exact frontend URL |
| `Too many authentication attempts` | Auth routes are rate-limited to 30 requests / 15 minutes |
| Password reset needed for demo | Re-run `npm run seed` (it resets demo passwords) |

---

## 11. Future roadmap (MandiLink phases)

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1 - Web MVP** | Farmer/buyer auth, listings, offers, dashboards, sample price comparison (this repository) | Done |
| **Phase 2 - Voice AI** | Urdu/Punjabi voice listing assistant (placeholder button exists on the farmer Create Listing page) | Planned |
| **Phase 3 - Admin panel** | User verification, listing moderation, reports, analytics (enum + role already in schema) | Planned |
| **Phase 4 - Mobile app** | React Native app reusing the exact same `/api/v1` backend and token model | Planned |
| **Phase 5 - Transport & payments** | Transport booking, payment/escrow flow, delivery tracking | Planned |
| **Phase 6 - Engagement** | Chat, price alerts, ratings, real mandi price feed | Planned |

Out of scope for Milestone 1: admin panel, voice AI, chat, transport, payments,
price alerts, mobile app. The architecture leaves room for all of them.
