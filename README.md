# gsbhouse — Local Development

## Quick Start

```bash
npm install
npm run dev
```

That's it. Open **http://localhost:5173** in your browser.

## How It Works Locally

- **Frontend** runs on Vite at `localhost:5173` with hot reload
- **Backend** runs on Express at `localhost:3001` (Vite proxies `/api` calls to it)
- **Database** is a local `data.json` file (auto-created on first use)
- **Verification codes** print to your terminal instead of sending emails

When you enter an email and click "Send verification code", look at your terminal:

```
══════════════════════════════════════════════════
📧 VERIFICATION CODE for you@stanford.edu
   Code: 847293
   Expires: 2:45:00 PM
══════════════════════════════════════════════════
```

Copy that code into the app to log in.

## Project Structure

```
├── server.js           # Express API server (auth, posts, users)
├── data.json           # Auto-generated local database (gitignored)
├── src/
│   ├── main.jsx        # React entry point
│   └── App.jsx         # Full app UI
├── index.html          # HTML shell
├── package.json
├── vite.config.js      # Vite config with API proxy
├── .env.example        # Optional env vars
└── README.md           # This file
```

## Editing with Claude Code

This project is designed to work great with Claude Code. Some things you might want to do:

- **Add new cities**: Edit the `CITIES` array in `src/App.jsx`
- **Change email domain**: Search for `@stanford.edu` in `server.js`
- **Add new form fields**: Search for `startPost` and `submitPost` in `src/App.jsx`
- **Modify the API**: All routes are in `server.js`
- **Style changes**: All styles are in the `S` object inside `App.jsx`

## Sending Real Emails (Optional)

To send real verification emails instead of terminal output:

1. Sign up at [resend.com](https://resend.com)
2. Create a `.env` file:
   ```
   RESEND_API_KEY=re_your_key_here
   EMAIL_FROM=gsbhouse <onboarding@resend.dev>
   ```
3. Restart the server

## Resetting Data

Delete `data.json` and restart the server to start fresh.

## Deploying to Production

When ready to deploy, see the `gsb-housing-deploy.zip` version which is
pre-configured for Vercel with Vercel KV (Redis) instead of local JSON storage.
