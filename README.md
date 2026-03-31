# gsbhouse

A housing matching platform for Stanford GSB MBA students — find sublets or connect with other students looking for housing.

**Live**: deployed on Vercel · **Auth**: Stanford email verification · **DB**: Neon Postgres

## Quick Start (Local)

```bash
npm install
vercel env pull .env.local   # pull DATABASE_URL + other secrets
echo "DEV_MODE=true" >> .env.local
npm run dev
```

Open **http://localhost:5173**. Verification codes print to your terminal instead of sending emails.

## How It Works

- **Frontend** — Vite dev server at `localhost:5173` with hot reload
- **Backend** — Express at `localhost:3001`; Vite proxies `/api/*` to it
- **Database** — Neon Postgres (all tables auto-created on server start via `initDB()`)
- **Codes** — When `DEV_MODE=true` (or no `RESEND_API_KEY`), codes print to terminal:

```
══════════════════════════════════════════════════
📧 VERIFICATION CODE for you@stanford.edu
   Code: 847293
══════════════════════════════════════════════════
```

## Project Structure

```
├── server.js           # Express API — all routes and middleware
├── api/index.js        # Vercel serverless entry point (re-exports server.js)
├── vercel.json         # Vercel routing config
├── src/
│   ├── main.jsx        # React entry point
│   └── App.jsx         # Entire frontend (single file)
├── tests/
│   ├── helpers.js      # Shared test utilities (mockAuth, row fixtures)
│   ├── auth.test.js    # send-code / verify-code routes
│   ├── users.test.js   # user profile routes
│   ├── posts.test.js   # posts CRUD routes
│   ├── ipRateLimit.test.js
│   └── rowToPost.test.js
├── docs/
│   └── project_architecture.md  # Full technical reference
├── vite.config.js      # Vite config with API proxy + Vitest config
└── package.json
```

## Running Tests

```bash
npm test              # single run
npm run test:watch    # watch mode
```

Tests use Vitest + supertest. The Neon DB is fully mocked — no real DB needed.

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/send-code` | — | Send 6-digit code to Stanford email |
| POST | `/api/verify-code` | — | Verify code, receive Bearer token |
| GET | `/api/user` | ✓ | Get current user profile |
| POST | `/api/user` | ✓ | Create or update profile |
| DELETE | `/api/user` | — | Logout (delete session) |
| GET | `/api/posts` | — | Get all posts |
| POST | `/api/posts` | ✓ | Create a post |
| PUT | `/api/posts?id=` | ✓ | Edit own post |
| DELETE | `/api/posts?id=` | ✓ | Delete own post |

All `/api/*` routes are IP rate-limited (60 req/min). Send-code is additionally limited to 1 per 30 seconds per email.

## Deployment

Vercel auto-deploys on every push to `main`. The Express app runs as a Vercel serverless function via `api/index.js`.

```bash
# Manual deploy
vercel --prod
```

Environment variables are managed via Vercel dashboard / `vercel env`.

## Editing

- **Add cities**: Edit the `CITIES` array in `src/App.jsx`
- **Change email domain**: Search `@stanford.edu` in `server.js`
- **Add form fields**: See `startPost` / `submitPost` in `src/App.jsx`
- **Styles**: All inline styles are in the `S` object in `src/App.jsx`
- **Full architecture**: see `docs/project_architecture.md`
