import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const sql = neon(process.env.DATABASE_URL);

// ─── INIT DATABASE ───
async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      class_year TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      email TEXT PRIMARY KEY,
      expires_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT DEFAULT '',
      class_year TEXT NOT NULL,
      city TEXT NOT NULL,
      move_in TEXT NOT NULL,
      move_out TEXT NOT NULL,
      lifestyle JSONB DEFAULT '[]',
      created_at BIGINT NOT NULL,
      neighborhoods TEXT,
      budget_max INTEGER,
      gender_pref TEXT,
      furnished TEXT,
      beds JSONB,
      baths JSONB,
      bath_privacy TEXT,
      note TEXT,
      address TEXT,
      price INTEGER,
      beds_avail INTEGER,
      description TEXT
    )
  `;
}

// Run initDB at module load (top-level await, works with ES modules)
await initDB();

// ─── AUTH HELPER ───
async function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const rows = await sql`
    SELECT email FROM sessions WHERE token = ${token} AND expires_at > ${Date.now()}
  `;
  return rows.length > 0 ? rows[0].email : null;
}

// ─── POST MAPPER ───
function rowToPost(row) {
  const post = {
    id: row.id,
    type: row.type,
    name: row.name,
    email: row.email,
    phone: row.phone,
    classYear: row.class_year,
    city: row.city,
    moveIn: row.move_in,
    moveOut: row.move_out,
    lifestyle: row.lifestyle || [],
    createdAt: Number(row.created_at),
  };

  if (row.type === "search") {
    Object.assign(post, {
      neighborhoods: row.neighborhoods || "",
      budgetMax: row.budget_max || 0,
      genderPref: row.gender_pref || "No preference",
      furnished: row.furnished || "Either",
      beds: row.beds || [],
      baths: row.baths || [],
      bathPrivacy: row.bath_privacy || "Shared bath OK",
      note: row.note || "",
    });
  } else {
    Object.assign(post, {
      address: row.address || "",
      price: row.price || 0,
      bedsAvail: row.beds_avail || 1,
      beds: row.beds || "",
      baths: row.baths || "",
      bathPrivacy: row.bath_privacy || "Shared bath",
      furnished: row.furnished || "Either",
      description: row.description || "",
    });
  }

  return post;
}

// ─── OPTIONAL: Resend for real emails ───
let resend = null;
if (process.env.RESEND_API_KEY && !process.env.DEV_MODE) {
  const { Resend } = await import("resend");
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("📧 Resend configured — codes will be emailed");
} else {
  console.log("📧 DEV_MODE or no RESEND_API_KEY — codes will be printed to terminal");
}

// ─── ROUTES ───

// POST /api/send-code
app.post("/api/send-code", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.endsWith("@stanford.edu")) {
    return res.status(400).json({ error: "Must use a @stanford.edu email" });
  }

  const rateRows = await sql`
    SELECT expires_at FROM rate_limits WHERE email = ${email} AND expires_at > ${Date.now()}
  `;
  if (rateRows.length > 0) {
    return res.status(429).json({ error: "Please wait 60 seconds before requesting another code" });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeExpiry = Date.now() + 10 * 60 * 1000;
  const rateExpiry = Date.now() + 60 * 1000;

  await sql`
    INSERT INTO codes (email, code, expires_at) VALUES (${email}, ${code}, ${codeExpiry})
    ON CONFLICT (email) DO UPDATE SET code = ${code}, expires_at = ${codeExpiry}
  `;
  await sql`
    INSERT INTO rate_limits (email, expires_at) VALUES (${email}, ${rateExpiry})
    ON CONFLICT (email) DO UPDATE SET expires_at = ${rateExpiry}
  `;

  if (resend) {
    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM || "gsbhouse <onboarding@resend.dev>",
        to: email,
        subject: "Your gsbhouse verification code",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
            <h1 style="font-size: 24px; margin-bottom: 8px;">gsb<span style="color: #c45d3e;">house</span></h1>
            <p style="color: #666;">Here's your verification code:</p>
            <div style="background: #f5f3ef; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="color: #999; font-size: 13px;">Expires in 10 minutes.</p>
          </div>
        `,
      });
    } catch (err) {
      console.error("Email send failed:", err);
      return res.status(500).json({ error: "Failed to send email" });
    }
  } else {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`📧 VERIFICATION CODE for ${email}`);
    console.log(`   Code: ${code}`);
    console.log(`   Expires: ${new Date(codeExpiry).toLocaleTimeString()}`);
    console.log(`${"═".repeat(50)}\n`);
  }

  return res.json({ success: true, message: "Code sent" });
});

// POST /api/verify-code
app.post("/api/verify-code", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code are required" });
  if (!email.endsWith("@stanford.edu")) return res.status(400).json({ error: "Must use a @stanford.edu email" });

  const rows = await sql`
    SELECT code FROM codes WHERE email = ${email} AND expires_at > ${Date.now()}
  `;
  if (rows.length === 0) return res.status(400).json({ error: "Code expired or not found. Please request a new one." });
  if (rows[0].code !== String(code)) return res.status(400).json({ error: "Incorrect code. Please try again." });

  await sql`DELETE FROM codes WHERE email = ${email}`;

  const token = crypto.randomUUID();
  const sessionExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await sql`
    INSERT INTO sessions (token, email, expires_at) VALUES (${token}, ${email}, ${sessionExpiry})
  `;

  return res.json({ success: true, token, email });
});

// GET /api/user
app.get("/api/user", async (req, res) => {
  const email = await authenticate(req);
  if (!email) return res.status(401).json({ error: "Not authenticated" });

  const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (rows.length === 0) return res.status(404).json({ error: "Profile not found" });

  const u = rows[0];
  return res.json({ user: { name: u.name, email: u.email, phone: u.phone, classYear: u.class_year } });
});

// POST /api/user
app.post("/api/user", async (req, res) => {
  const email = await authenticate(req);
  if (!email) return res.status(401).json({ error: "Not authenticated" });

  const { name, phone, classYear } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  if (!["2026", "2027"].includes(classYear)) return res.status(400).json({ error: "Invalid class year" });

  await sql`
    INSERT INTO users (email, name, phone, class_year)
    VALUES (${email}, ${name.trim()}, ${phone || ""}, ${classYear})
    ON CONFLICT (email) DO UPDATE SET name = ${name.trim()}, phone = ${phone || ""}, class_year = ${classYear}
  `;

  return res.json({ user: { name: name.trim(), email, phone: phone || "", classYear } });
});

// DELETE /api/user (logout)
app.delete("/api/user", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    await sql`DELETE FROM sessions WHERE token = ${authHeader.slice(7)}`;
  }
  return res.json({ success: true });
});

// GET /api/posts
app.get("/api/posts", async (req, res) => {
  const rows = await sql`SELECT * FROM posts ORDER BY created_at DESC`;
  return res.json({ posts: rows.map(rowToPost) });
});

// POST /api/posts
app.post("/api/posts", async (req, res) => {
  const email = await authenticate(req);
  if (!email) return res.status(401).json({ error: "Not authenticated" });

  const userRows = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (userRows.length === 0) return res.status(400).json({ error: "Please create a profile first" });
  const profile = userRows[0];

  const data = req.body;
  if (!data.type || !data.city || !data.moveIn || !data.moveOut) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (data.type === "sublet" && !data.price) {
    return res.status(400).json({ error: "Price is required for sublets" });
  }

  const id = "p" + Date.now() + Math.random().toString(36).slice(2, 6);
  const createdAt = Date.now();

  if (data.type === "search") {
    await sql`
      INSERT INTO posts (
        id, type, name, email, phone, class_year, city, move_in, move_out, lifestyle, created_at,
        neighborhoods, budget_max, gender_pref, furnished, beds, baths, bath_privacy, note
      ) VALUES (
        ${id}, 'search', ${profile.name}, ${email}, ${profile.phone}, ${profile.class_year},
        ${data.city}, ${data.moveIn}, ${data.moveOut}, ${JSON.stringify(data.lifestyle || [])}, ${createdAt},
        ${data.neighborhoods || ""}, ${parseInt(data.budgetMax) || 0}, ${data.genderPref || "No preference"},
        ${data.furnished || "Either"}, ${JSON.stringify(data.beds || [])}, ${JSON.stringify(data.baths || [])},
        ${data.bathPrivacy || "Shared bath OK"}, ${data.note || ""}
      )
    `;
  } else {
    await sql`
      INSERT INTO posts (
        id, type, name, email, phone, class_year, city, move_in, move_out, lifestyle, created_at,
        address, price, beds_avail, beds, baths, bath_privacy, furnished, description
      ) VALUES (
        ${id}, 'sublet', ${profile.name}, ${email}, ${profile.phone}, ${profile.class_year},
        ${data.city}, ${data.moveIn}, ${data.moveOut}, ${JSON.stringify(data.lifestyle || [])}, ${createdAt},
        ${data.address || ""}, ${parseInt(data.price) || 0}, ${parseInt(data.bedsAvail) || 1},
        ${JSON.stringify(data.beds || "")}, ${JSON.stringify(data.baths || "")},
        ${data.bathPrivacy || "Shared bath"}, ${data.furnished || "Either"}, ${data.description || ""}
      )
    `;
  }

  const newRows = await sql`SELECT * FROM posts WHERE id = ${id}`;
  return res.status(201).json({ post: rowToPost(newRows[0]) });
});

// DELETE /api/posts
app.delete("/api/posts", async (req, res) => {
  const email = await authenticate(req);
  if (!email) return res.status(401).json({ error: "Not authenticated" });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Post ID is required" });

  const rows = await sql`SELECT email FROM posts WHERE id = ${id}`;
  if (rows.length === 0) return res.status(404).json({ error: "Post not found" });
  if (rows[0].email !== email) return res.status(403).json({ error: "You can only delete your own posts" });

  await sql`DELETE FROM posts WHERE id = ${id}`;
  return res.json({ success: true });
});

// ─── LOCAL DEV: listen on port ───
// On Vercel, the app is exported as a serverless function (no app.listen needed)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🏠 gsbhouse server running at http://localhost:${PORT}`);
    console.log(`🖥️  Frontend dev server at http://localhost:5173\n`);
  });
}

export default app;
