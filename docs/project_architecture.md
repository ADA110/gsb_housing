---
name: gsbhouse project architecture
description: Full architecture overview of gsbhouse — a housing matching platform for Stanford GSB MBA students
type: project
---

# gsbhouse — Housing Matching Platform for Stanford GSB

## Purpose
Helps Stanford GSB MBA students (class years 2026/2027) find housing matches: either students looking for housing ("search" posts) or students subletting their apartment ("sublet" posts).

## Stack
- **Frontend**: React 18 + Vite, single file `src/App.jsx`
- **Backend**: Express (Node.js), single file `server.js`, port 3001 locally
- **Database**: Neon Postgres (via Vercel Marketplace) — migrated from `data.json`
- **Bundler/Dev**: Vite dev server port 5173, proxies `/api/*` → Express at 3001
- **Email**: Resend via `adatest.website` domain (RESEND_API_KEY + EMAIL_FROM env vars); without RESEND_API_KEY, codes print to terminal
- **Start**: `npm run dev` uses `concurrently` to run both servers
- **Deployed**: Vercel (GitHub auto-deploy on push to main)

## Vercel Deployment
- `vercel.json` routes `/api/*` → `api/index.js` (serverless function) and everything else → `dist/index.html`
- `api/index.js` re-exports the Express app from `server.js`
- `server.js` exports `app` as default; only calls `app.listen()` when `!process.env.VERCEL`
- Vite builds frontend to `dist/`, served as static files by Vercel CDN
- `DATABASE_URL` and all Neon/Resend env vars auto-provisioned via Vercel Marketplace

## Auth Flow
1. User enters `@stanford.edu` email → POST `/api/send-code` (rate-limited 1/30s, codes expire 10min)
2. User enters 6-digit code → POST `/api/verify-code` → returns Bearer token (30-day session)
3. Token stored in `localStorage` as `gsb-token`, sent as `Authorization: Bearer <token>` on all API calls
4. On first login (no profile), user fills name/phone/classYear → POST `/api/user`

## Database (Neon Postgres)
Tables (all created via `initDB()` on server startup using `CREATE TABLE IF NOT EXISTS`):
- `users` — email (PK), name, phone, class_year
- `sessions` — token (PK), email, expires_at (BIGINT ms timestamp)
- `codes` — email (PK), code, expires_at
- `rate_limits` — email (PK), expires_at
- `ip_rate_limits` — ip + time_window (composite PK), count; enforces 60 req/min per IP
- `posts` — all post fields; `beds`/`baths`/`lifestyle` stored as JSONB (arrays for search, strings for sublet)

Snake_case in DB, camelCase in API responses — `rowToPost()` handles the mapping.

## Post Data Model

**Search post** (student looking for housing):
- `type: "search"`
- `beds: string[]` — e.g. `["2", "3"]` (bedrooms acceptable)
- `baths: string[]` — e.g. `["1", "2"]` (bathrooms acceptable)
- `bathPrivacy: "Private bath" | "Shared bath OK"`
- `neighborhoods: string` — comma-separated or `"Any"`
- `budgetMax: number` — per person per month
- `genderPref: string` — `"No preference" | "Male" | "Female" | "Non-binary"`
- `furnished: string` — `"Either" | ...`
- `lifestyle: string[]` — lifestyle tags
- `note: string`

**Sublet post** (student listing apartment):
- `type: "sublet"`
- `beds: string` — total bedrooms (single value)
- `baths: string` — total bathrooms (single value)
- `bathPrivacy: "Private bath" | "Shared bath"`
- `bedsAvail: number` — how many bedrooms available
- `price: number` — monthly rent
- `address: string`
- `furnished: string`
- `description: string`
- `lifestyle: string[]`

**Common fields**: `id`, `type`, `name`, `email`, `phone`, `classYear`, `city`, `moveIn`, `moveOut`, `createdAt`

## API Endpoints
- `POST /api/send-code` — send verification code
- `POST /api/verify-code` — verify code, return token
- `GET /api/user` — get current user profile (auth required)
- `POST /api/user` — create/update profile (auth required)
- `DELETE /api/user` — logout / delete session
- `GET /api/posts` — get all posts (public)
- `POST /api/posts` — create post (auth required, profile required)
- `PUT /api/posts?id=<id>` — edit own post (auth required, ownership verified)
- `DELETE /api/posts?id=<id>` — delete own post (auth required)

## Frontend Architecture (`src/App.jsx`)
Single React component (`App`) with all state managed via `useState`. Views controlled by `view` state:
- `"cities"` — city grid browser
- `"city"` — posts for a city with tabs ("looking" / "sublets") and filters
- `"post-search"` — form to create a search post
- `"post-sublet"` — form to create a sublet post

All styles are inline, stored in the `S` object inside `App`. No CSS files.

City list: SF, NY, Chicago, LA, Seattle, Boston, Austin, DC, Denver, Miami, London, Other.

Filtering (client-side): date range, budget/price max, gender pref, furnished, beds, baths.

## Key Options/Constants (App.jsx)
- `LIFESTYLE_TAGS`: 10 tags (Early riser, Night owl, Quiet, Social, etc.)
- `BD_OPTIONS`: ["1", "2", "3", "4+"]
- `BA_OPTIONS`: ["1", "2", "3+"]
- `BATH_PRIVACY`: ["Private bath", "Shared bath OK"]
- `GENDER_PREFS`: ["No preference", "Male", "Female", "Non-binary"]

## Email Setup
- Domain: `adatest.website` (registered on Namecheap, verified with Resend)
- Resend DNS records added to Namecheap Advanced DNS: DKIM TXT, SPF TXT, DMARC TXT (MX skipped — not needed for sending)
- `EMAIL_FROM` env var set to sender address using `adatest.website` domain
- `RESEND_API_KEY` set in Vercel env vars

## IP Rate Limiting
All `/api/*` routes are protected by an IP rate limiter middleware:
- Uses the `ip_rate_limits` table with fixed 1-minute windows (`Math.floor(Date.now() / 60000)`)
- Atomically increments via `INSERT ... ON CONFLICT DO UPDATE` and returns the new count
- Returns HTTP 429 if count exceeds 60 requests/window
- Fails open (if the DB call throws, the request is allowed through)
- 1% chance cleanup: deletes rows from previous windows to prevent table bloat

## DEV_MODE
Set `DEV_MODE=true` in `.env.local` to skip Resend and print verification codes to terminal instead. This avoids having to remove `RESEND_API_KEY` when running locally after a `vercel env pull`.

## Testing
- **Framework**: Vitest (ESM-compatible) + supertest for HTTP assertions
- **Run**: `npm test` (single run) or `npm run test:watch`
- **Strategy**: `vi.mock('@neondatabase/serverless')` hoisted before `server.js` import; all SQL calls return a mock `sql` function
- **Default mock**: `[{ count: 1 }]` — satisfies ipRateLimit (count ≤ 60) and most queries
- **Per-test overrides**: `sql.mockResolvedValueOnce(...)` queues return values in call order
- **Auth helper**: `mockAuth(sql)` in `tests/helpers.js` queues the ip-limit and session calls
- **beforeEach**: `sql.mockReset()` (not `mockClear`) to flush leftover Once values between tests
- **Port conflicts**: `app.listen()` is skipped when `process.env.VITEST` is set

## Local Dev Notes
- `vercel env pull .env.local` syncs all env vars locally (including DATABASE_URL, RESEND_API_KEY)
- Add `DEV_MODE=true` to `.env.local` after pulling to keep codes printing to terminal
- `.env.local` is gitignored

## Production
- `npm run build` — Vite build to `dist/`
- Vercel auto-deploys on every push to `main` via GitHub integration
