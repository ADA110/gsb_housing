# gsbhouse

A housing matching platform for Stanford GSB MBA students.

## Architecture

- **Frontend**: React 18 + Vite (src/App.jsx is the entire UI in one file)
- **Backend**: Express server (server.js) with JSON file persistence (data.json)
- **Auth**: Email verification codes sent to @stanford.edu addresses
- **No external DB**: Everything stored in data.json locally

## Running

```bash
npm run dev
```

This starts both the Express server (port 3001) and Vite dev server (port 5173).
Vite proxies /api/* requests to Express.

## Key Files

- `src/App.jsx` — All UI code: auth flow, city browser, cards, forms, filters
- `server.js` — All API routes: send-code, verify-code, user CRUD, posts CRUD
- `data.json` — Auto-generated local database (gitignored)
- `vite.config.js` — Vite config with proxy to Express

## Important Patterns

- All styles are inline in the `S` object inside App.jsx (no CSS files)
- Auth uses Bearer token in localStorage, sent on all API calls via the `api()` helper
- Posts are stored as a flat array; filtered client-side by city/type
- Search posts have multi-select fields (beds, baths, lifestyle) stored as arrays
- Sublet posts have single-value fields (beds, baths) stored as strings
- Verification codes print to terminal in dev (no email service needed)

## Data Model

**Search post** (student looking for housing):
- beds: string[] (e.g. ["2", "3"]) — bedrooms they'd consider
- baths: string[] (e.g. ["1", "2"]) — bathrooms they'd consider
- bathPrivacy: "Private bath" | "Shared bath OK"
- neighborhoods: comma-separated string or "Any"
- budgetMax: number (per person per month)

**Sublet post** (student listing their apartment):
- beds: string (e.g. "2") — total bedrooms
- baths: string (e.g. "1") — total bathrooms
- bathPrivacy: "Private bath" | "Shared bath"
- bedsAvail: number — how many bedrooms are available
- price: number (monthly rent)
- address: string

## Testing Auth Locally

Enter any @stanford.edu email → check terminal for 6-digit code → enter code.
No real email is sent in dev mode.
