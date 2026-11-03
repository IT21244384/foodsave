# FoodSave – Surplus Food Rescue and Redistribution

IT2150 IT Project · Janahan R (IT22069740) · Abisheak S (IT21244384)

Restaurants post end-of-day surplus food. Nearby customers buy it at a discount, and verified
charities claim donations for free, all before the food's safe-until time.

**Stack:** MongoDB, Express, React and Node.js (MERN), with Leaflet + OpenStreetMap for maps.

## Run it

You need Node.js 20 or newer. No database install is needed for a demo.

```bash
npm run setup     # install server and client packages (first time only)
npm run demo      # build the React client and start everything on http://localhost:4000
```

With no `MONGODB_URI` set, the server starts an **in-memory MongoDB filled with demo data**.
Every restart gives you fresh data. The first start downloads the MongoDB engine, which takes
about a minute.

To use a real database (e.g. MongoDB Atlas), copy `server/.env.example` to `server/.env`, set
`MONGODB_URI` and `JWT_SECRET`, then run `npm run seed --prefix server` once.

For development with hot reload, open two terminals:

```bash
npm run dev:server   # API on http://localhost:4000
npm run dev:client   # React on http://localhost:5173 (calls the API through a proxy)
```

## Demo accounts

All demo accounts use the password **`Demo@1234`**. All names are sample data.

| Role | Email | Notes |
|---|---|---|
| Administrator | admin@foodsave.lk | Verifies restaurants and charities |
| Restaurant (approved) | dilan@greenleaf.lk | Green Leaf Café, Malabe |
| Restaurant (pending) | tharindu@newtaste.lk | Cannot post until approved |
| Customer | nimal@example.com | "Near me" search |
| Charity (approved) | sahana@charity.lk | Sahana Elders’ Home |
| Charity (pending) | hope@charity.lk | Hope Community Kitchen |

Sign-in is rate limited to 10 attempts per 15 minutes per IP address. If you hit the limit,
restart the server.

Demo pickup codes for Green Leaf Café: `FS-4821`, `FS-2290` and the charity claim `DN-5120`. Any other
code is rejected, for example `FS-0000`.

## Tests

```bash
npm test        # 115 unit, API, security, integration and system tests, with coverage
npm run e2e     # 16 browser journeys in Edge or Chrome, plus an axe-core accessibility scan
npm run perf    # search with 1,000 listings, and 50 customers on 10 packs
```

Test IDs are `TC-F1-xx` (F1), `TC-F2-xx` (F2), `TC-AU-xx` (accounts), `TC-SEC-xx` (security), `TC-INT-xx`
(integration), `TC-SYS-xx` (system) and `TC-E2E-xx` (browser). The latest results are in `docs/evidence/`
and the screenshots are in `docs/screenshots/`.

## Requirements

| Requirement | Owner | Status |
|---|---|---|
| Accounts, sign-in, role-based access | Both | Done |
| FR1.1 Restaurant registration and admin verification | Janahan R | Done |
| FR1.2 Create, view, update, withdraw surplus listings | Janahan R | Done |
| FR1.3 Listing validation and food-safety rules | Janahan R | Done |
| FR1.4 Automatic expiry job every 5 minutes | Janahan R | Done |
| FR1.5 Hand-over by pickup code, no-shows | Janahan R | Done |
| FR1.6 Search own listings, monthly report and PDF | Janahan R | Done |
| FR2.1 Charity registration with certificate, admin verification | Abisheak S | Done |
| FR2.2 "Near me" search with map and filters | Abisheak S | Done |
| FR2.3 Customer reservations with pickup codes, cancel | Abisheak S | Done |
| FR2.4 Charity claims with a daily fair-share limit | Abisheak S | Done |
| FR2.5 Atomic stock lock (no double-booking) | Abisheak S | Done |
| FR2.6 Impact dashboard and PDF | Abisheak S | Done |

## Project structure

```
server/
  src/models/        User, Restaurant, Charity, SurplusListing, Reservation, DonationClaim, Notification
  src/routes/        auth, restaurants, listings, handover (F1); reservations, claims, charities (F2); admin, notifications
  src/services/      holds (stock lock and pickup codes), impact figures, PDF reports
  src/jobs/          expiry job
  src/validation/    zod request schemas and the FR1.3 listing rules
  src/middleware/    JWT auth and roles, validation, uploads, error handling
  src/seed/          demo data
  tests/             Jest + Supertest; system/ journeys; perf/ measurements
client/
  src/pages/restaurant/   F1 screens
  src/pages/FindSurplus.jsx, ListingDetail.jsx, MyReservations.jsx, charity/, admin/   F2 screens
e2e/                 browser journeys and accessibility scan
docs/                screenshots and test evidence
```
