import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── JSON FILE STORE ───
// Simple persistent storage using a local JSON file.
// In production, swap this for a real database.

const DB_PATH = path.join(__dirname, "data.json");

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    }
  } catch {}
  return { codes: {}, rateLimits: {}, sessions: {}, users: {}, posts: [] };
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Clean up expired codes and rate limits on each request
function cleanExpired(db) {
  const now = Date.now();
  for (const [key, val] of Object.entries(db.codes)) {
    if (val.expiresAt < now) delete db.codes[key];
  }
  for (const [key, val] of Object.entries(db.rateLimits)) {
    if (val.expiresAt < now) delete db.rateLimits[key];
  }
  for (const [key, val] of Object.entries(db.sessions)) {
    if (val.expiresAt < now) delete db.sessions[key];
  }
}

// Auth helper
function authenticate(req, db) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const session = db.sessions[token];
  if (!session || session.expiresAt < Date.now()) return null;
  return session.email;
}

// ─── OPTIONAL: Resend for real emails ───
// Set RESEND_API_KEY in .env to send real emails.
// Without it, codes are printed to the terminal (great for dev).

let resend = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = await import("resend");
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("📧 Resend configured — codes will be emailed");
} else {
  console.log("📧 No RESEND_API_KEY — codes will be printed to terminal");
}

// ─── ROUTES ───

// POST /api/send-code
app.post("/api/send-code", async (req, res) => {
  const db = loadDB();
  cleanExpired(db);

  const { email } = req.body;
  if (!email || !email.endsWith("@stanford.edu")) {
    return res.status(400).json({ error: "Must use a @stanford.edu email" });
  }

  // Rate limit: 1 code per 60 seconds
  if (db.rateLimits[email] && db.rateLimits[email].expiresAt > Date.now()) {
    return res.status(429).json({ error: "Please wait 60 seconds before requesting another code" });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));

  db.codes[email] = { code, expiresAt: Date.now() + 10 * 60 * 1000 }; // 10 min
  db.rateLimits[email] = { expiresAt: Date.now() + 60 * 1000 }; // 60 sec
  saveDB(db);

  // Send or log the code
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
    console.log(`   Expires: ${new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString()}`);
    console.log(`${"═".repeat(50)}\n`);
  }

  return res.json({ success: true, message: "Code sent" });
});

// POST /api/verify-code
app.post("/api/verify-code", (req, res) => {
  const db = loadDB();
  cleanExpired(db);

  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code are required" });
  if (!email.endsWith("@stanford.edu")) return res.status(400).json({ error: "Must use a @stanford.edu email" });

  const stored = db.codes[email];
  if (!stored) return res.status(400).json({ error: "Code expired or not found. Please request a new one." });
  if (stored.code !== String(code)) return res.status(400).json({ error: "Incorrect code. Please try again." });

  // Code valid — delete it
  delete db.codes[email];

  // Create session
  const token = crypto.randomUUID();
  db.sessions[token] = { email, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }; // 30 days
  saveDB(db);

  return res.json({ success: true, token, email });
});

// GET/POST/DELETE /api/user
app.get("/api/user", (req, res) => {
  const db = loadDB();
  cleanExpired(db);
  const email = authenticate(req, db);
  if (!email) return res.status(401).json({ error: "Not authenticated" });
  const profile = db.users[email];
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  return res.json({ user: profile });
});

app.post("/api/user", (req, res) => {
  const db = loadDB();
  cleanExpired(db);
  const email = authenticate(req, db);
  if (!email) return res.status(401).json({ error: "Not authenticated" });

  const { name, phone, classYear } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  if (!["2026", "2027"].includes(classYear)) return res.status(400).json({ error: "Invalid class year" });

  const profile = { name: name.trim(), email, phone: phone || "", classYear };
  db.users[email] = profile;
  saveDB(db);
  return res.json({ user: profile });
});

app.delete("/api/user", (req, res) => {
  const db = loadDB();
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    delete db.sessions[authHeader.slice(7)];
    saveDB(db);
  }
  return res.json({ success: true });
});

// GET/POST/DELETE /api/posts
app.get("/api/posts", (req, res) => {
  const db = loadDB();
  return res.json({ posts: db.posts || [] });
});

app.post("/api/posts", (req, res) => {
  const db = loadDB();
  cleanExpired(db);
  const email = authenticate(req, db);
  if (!email) return res.status(401).json({ error: "Not authenticated" });

  const profile = db.users[email];
  if (!profile) return res.status(400).json({ error: "Please create a profile first" });

  const data = req.body;
  if (!data.type || !data.city || !data.moveIn || !data.moveOut) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (data.type === "sublet" && !data.price) {
    return res.status(400).json({ error: "Price is required for sublets" });
  }

  const post = {
    id: "p" + Date.now() + Math.random().toString(36).slice(2, 6),
    type: data.type,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    classYear: profile.classYear,
    city: data.city,
    moveIn: data.moveIn,
    moveOut: data.moveOut,
    lifestyle: data.lifestyle || [],
    createdAt: Date.now(),
  };

  if (data.type === "search") {
    Object.assign(post, {
      neighborhoods: data.neighborhoods || "",
      budgetMax: parseInt(data.budgetMax) || 0,
      genderPref: data.genderPref || "No preference",
      furnished: data.furnished || "Either",
      beds: data.beds || [],
      baths: data.baths || [],
      bathPrivacy: data.bathPrivacy || "Shared bath OK",
      note: data.note || "",
    });
  } else {
    Object.assign(post, {
      address: data.address || "",
      price: parseInt(data.price) || 0,
      bedsAvail: parseInt(data.bedsAvail) || 1,
      beds: data.beds || "",
      baths: data.baths || "",
      bathPrivacy: data.bathPrivacy || "Shared bath",
      furnished: data.furnished || "Either",
      description: data.description || "",
    });
  }

  db.posts.push(post);
  saveDB(db);
  return res.status(201).json({ post });
});

app.delete("/api/posts", (req, res) => {
  const db = loadDB();
  cleanExpired(db);
  const email = authenticate(req, db);
  if (!email) return res.status(401).json({ error: "Not authenticated" });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Post ID is required" });

  const post = db.posts.find((p) => p.id === id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.email !== email) return res.status(403).json({ error: "You can only delete your own posts" });

  db.posts = db.posts.filter((p) => p.id !== id);
  saveDB(db);
  return res.json({ success: true });
});

// ─── SERVE STATIC IN PRODUCTION ───
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`\n🏠 gsbhouse server running at http://localhost:${PORT}`);
  console.log(`🖥️  Frontend dev server at http://localhost:5173\n`);
});
