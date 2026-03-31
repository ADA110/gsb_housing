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
- **Backend**: Express (Node.js), single file `server.js`, port 3001
- **Database**: `data.json` flat JSON file (no external DB)
- **Bundler/Dev**: Vite dev server port 5173, proxies `/api/*` → Express at 3001
- **Email**: Resend (optional via RESEND_API_KEY env var); without it, codes print to terminal
- **Start**: `npm run dev` uses `concurrently` to run both servers

## Auth Flow
1. User enters `@stanford.edu` email → POST `/api/send-code` (rate-limited 1/60s, codes expire 10min)
2. User enters 6-digit code → POST `/api/verify-code` → returns Bearer token (30-day session)
3. Token stored in `localStorage` as `gsb-token`, sent as `Authorization: Bearer <token>` on all API calls
4. On first login (no profile), user fills name/phone/classYear → POST `/api/user`

## Data Store (`data.json`)
Keys:
- `codes`: `{ [email]: { code, expiresAt } }` — pending verification codes
- `rateLimits`: `{ [email]: { expiresAt } }` — 60s rate limit per email
- `sessions`: `{ [token]: { email, expiresAt } }` — active sessions (30 days)
- `users`: `{ [email]: { name, email, phone, classYear } }` — user profiles
- `posts`: flat array of post objects

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

## Production
- `npm run start` — runs Express only (serves built `dist/` as static files)
- `npm run build` — Vite build to `dist/`

**Why:** This is a simple local-first app; no external DB, no complex infra — designed for rapid iteration within a small GSB community.
