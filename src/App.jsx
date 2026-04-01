import { useState, useEffect } from "react";

const CITIES = [
  { name: "San Francisco", emoji: "🌉", state: "CA" },
  { name: "South Bay", emoji: "💻", state: "CA" },
  { name: "New York", emoji: "🗽", state: "NY" },
  { name: "Chicago", emoji: "🏙️", state: "IL" },
  { name: "Los Angeles", emoji: "🌴", state: "CA" },
  { name: "Seattle", emoji: "☕", state: "WA" },
  { name: "Boston", emoji: "🎓", state: "MA" },
  { name: "Austin", emoji: "🎸", state: "TX" },
  { name: "Washington DC", emoji: "🏛️", state: "DC" },
  { name: "Denver", emoji: "⛰️", state: "CO" },
  { name: "Miami", emoji: "🌊", state: "FL" },
  { name: "London", emoji: "🇬🇧", state: "UK" },
  { name: "Other", emoji: "📍", state: "" },
];

const LIFESTYLE_TAGS = ["Early riser", "Night owl", "Quiet", "Social", "Pet-friendly", "Non-smoker", "Fitness-oriented", "Vegetarian/Vegan kitchen", "Work from home", "Has car / needs parking"];
const BD_OPTIONS = ["1", "2", "3", "4+"];
const BA_OPTIONS = ["1", "2", "3+"];
const BATH_PRIVACY = ["Private bath", "Shared bath OK"];
const GENDER_PREFS = ["No preference", "Male", "Female", "Non-binary"];

// ─── API HELPER ───
async function api(path, options = {}) {
  const token = localStorage.getItem("gsb-token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function adminApi(path, options = {}, secret) {
  const headers = { "Content-Type": "application/json", "X-Admin-Secret": secret };
  const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

export default function App() {
  const [user, setUser] = useState(null);
  // Auth steps: "email" → "code" → "profile" → done (user is set)
  const [authStep, setAuthStep] = useState("email");
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authYear, setAuthYear] = useState("2026");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [codeSentMessage, setCodeSentMessage] = useState("");

  const [view, setView] = useState("cities");
  const [selectedCity, setSelectedCity] = useState(null);
  const [tab, setTab] = useState("looking");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterBudgetMax, setFilterBudgetMax] = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterFurnished, setFilterFurnished] = useState("");
  const [filterBeds, setFilterBeds] = useState("");
  const [filterBaths, setFilterBaths] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [form, setForm] = useState({});
  const [editingPostId, setEditingPostId] = useState(null);

  const isAdminMode = new URLSearchParams(window.location.search).has("admin");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminPerson, setAdminPerson] = useState({ name: "", email: "", phone: "", classYear: "2026" });

  // ─── INITIAL LOAD ───
  useEffect(() => {
    (async () => {
      // Check for existing session
      const token = localStorage.getItem("gsb-token");
      if (token) {
        try {
          const { user: profile } = await api("/api/user");
          setUser(profile);
        } catch {
          // Token invalid, clear it
          localStorage.removeItem("gsb-token");
        }
      }
      // Load posts (public, no auth needed)
      try {
        const { posts: allPosts } = await api("/api/posts");
        setPosts(allPosts);
      } catch {
        setPosts([]);
      }
      setLoading(false);
    })();
  }, []);

  // ─── AUTH FLOW ───
  async function handleSendCode() {
    if (!authEmail.endsWith("@stanford.edu")) {
      setAuthError("Please use your @stanford.edu email");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      await api("/api/send-code", {
        method: "POST",
        body: JSON.stringify({ email: authEmail }),
      });
      setAuthStep("code");
      setCodeSentMessage(`Code sent to ${authEmail}`);
    } catch (err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  }

  async function handleVerifyCode() {
    if (authCode.length !== 6) {
      setAuthError("Please enter the 6-digit code");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const { token, email } = await api("/api/verify-code", {
        method: "POST",
        body: JSON.stringify({ email: authEmail, code: authCode }),
      });
      localStorage.setItem("gsb-token", token);

      // Check if user already has a profile
      try {
        const { user: profile } = await api("/api/user");
        setUser(profile);
        // Refresh posts now that we're authed
        const { posts: allPosts } = await api("/api/posts");
        setPosts(allPosts);
      } catch {
        // No profile yet, go to profile setup
        setAuthStep("profile");
      }
    } catch (err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  }

  async function handleCreateProfile() {
    if (!authName.trim()) {
      setAuthError("Please enter your name");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const { user: profile } = await api("/api/user", {
        method: "POST",
        body: JSON.stringify({ name: authName, phone: authPhone, classYear: authYear }),
      });
      setUser(profile);
      const { posts: allPosts } = await api("/api/posts");
      setPosts(allPosts);
    } catch (err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  }

  async function handleLogout() {
    try { await api("/api/user", { method: "DELETE" }); } catch {}
    localStorage.removeItem("gsb-token");
    setUser(null);
    setView("cities");
    setAuthStep("email");
    setAuthEmail("");
    setAuthCode("");
    setAuthName("");
    setAuthPhone("");
    setAuthError("");
    setCodeSentMessage("");
  }

  // ─── POSTS ───
  async function refreshPosts() {
    try {
      const { posts: allPosts } = await api("/api/posts");
      setPosts(allPosts);
    } catch {}
  }

  function openCity(city) {
    setSelectedCity(city); setView("city"); setTab("looking"); setShowFilters(false);
    setFilterDateFrom(""); setFilterDateTo(""); setFilterBudgetMax(""); setFilterGender(""); setFilterFurnished(""); setFilterBeds(""); setFilterBaths("");
  }

  function getCityPosts(type) {
    if (!selectedCity) return [];
    let f = posts.filter(p => p.city === selectedCity.name && p.type === type);
    if (filterDateFrom) f = f.filter(p => p.moveOut >= filterDateFrom);
    if (filterDateTo) f = f.filter(p => p.moveIn <= filterDateTo);
    if (filterBudgetMax) {
      const max = parseInt(filterBudgetMax);
      f = f.filter(p => type === "sublet" ? p.price <= max : p.budgetMax <= max);
    }
    if (filterGender && type === "search") f = f.filter(p => p.genderPref === filterGender || p.genderPref === "No preference");
    if (filterFurnished && type !== "search") f = f.filter(p => p.furnished === filterFurnished || p.furnished === "Either");
    if (filterBeds) {
      f = f.filter(p => {
        if (type === "search") return (p.beds || []).includes(filterBeds);
        return p.beds === filterBeds;
      });
    }
    if (filterBaths) {
      f = f.filter(p => {
        if (type === "search") return (p.baths || []).includes(filterBaths);
        return p.baths === filterBaths;
      });
    }
    return f.sort((a, b) => b.createdAt - a.createdAt);
  }

  function getCityCounts(cn) {
    return { searches: posts.filter(p => p.city === cn && p.type === "search").length, sublets: posts.filter(p => p.city === cn && p.type === "sublet").length };
  }

  function startPost(type) {
    if (!user) { alert("Please sign in first"); return; }
    setEditingPostId(null);
    setForm({ city: selectedCity?.name || "", neighborhoods: "", moveIn: "", moveOut: "", budgetMax: "", price: "", bedsAvail: "1", genderPref: "No preference", furnished: "Either", beds: [], baths: [], bathPrivacy: "Shared bath OK", lifestyle: [], note: "", description: "", address: "" });
    setView(type === "search" ? "post-search" : "post-sublet");
  }

  function startEdit(post) {
    setEditingPostId(post.id);
    setForm({
      city: post.city, moveIn: post.moveIn, moveOut: post.moveOut, lifestyle: post.lifestyle || [],
      neighborhoods: post.neighborhoods || "", budgetMax: post.budgetMax || "", genderPref: post.genderPref || "No preference",
      furnished: post.furnished || "Either", beds: post.beds || (post.type === "search" ? [] : ""),
      baths: post.baths || (post.type === "search" ? [] : ""), bathPrivacy: post.bathPrivacy || "Shared bath OK",
      note: post.note || "", address: post.address || "", price: post.price || "",
      bedsAvail: post.bedsAvail || "1", description: post.description || "",
    });
    setView(post.type === "search" ? "post-search" : "post-sublet");
  }

  async function submitPost(type) {
    const data = { type, city: form.city, moveIn: form.moveIn, moveOut: form.moveOut, lifestyle: form.lifestyle || [] };
    if (type === "search") {
      if (!form.city || !form.moveIn || !form.moveOut) { alert("Please fill in city and dates"); return; }
      Object.assign(data, { neighborhoods: form.neighborhoods, budgetMax: form.budgetMax, genderPref: form.genderPref, furnished: form.furnished, beds: form.beds, baths: form.baths, bathPrivacy: form.bathPrivacy, note: form.note });
    } else {
      if (!form.city || !form.moveIn || !form.moveOut || !form.price) { alert("Please fill in city, dates, and price"); return; }
      Object.assign(data, { address: form.address, price: form.price, bedsAvail: form.bedsAvail, beds: form.beds, baths: form.baths, bathPrivacy: form.bathPrivacy, furnished: form.furnished, description: form.description });
    }
    try {
      if (editingPostId) {
        await api(`/api/posts?id=${editingPostId}`, { method: "PUT", body: JSON.stringify(data) });
        setEditingPostId(null);
      } else {
        await api("/api/posts", { method: "POST", body: JSON.stringify(data) });
      }
      await refreshPosts();
      const city = CITIES.find(c => c.name === form.city);
      if (city) { openCity(city); setTab(type === "search" ? "looking" : "sublets"); } else { setView("cities"); }
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function deletePost(id) {
    if (!confirm("Remove this post?")) return;
    try {
      await api(`/api/posts?id=${id}`, { method: "DELETE" });
      await refreshPosts();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function handleAdminUnlock() {
    if (!adminSecretInput) { setAdminError("Please enter the admin secret"); return; }
    setAdminLoading(true);
    setAdminError("");
    try {
      await adminApi("/api/admin/verify", {}, adminSecretInput);
      setAdminSecret(adminSecretInput);
      setAdminUnlocked(true);
    } catch (err) {
      setAdminError(err.message || "Invalid secret");
    }
    setAdminLoading(false);
  }

  function adminStartPost(type) {
    setEditingPostId(null);
    setAdminPerson({ name: "", email: "", phone: "", classYear: "2026" });
    setForm({ city: "", neighborhoods: "", moveIn: "", moveOut: "", budgetMax: "", price: "", bedsAvail: "1", genderPref: "No preference", furnished: "Either", beds: [], baths: [], bathPrivacy: "Shared bath OK", lifestyle: [], note: "", description: "", address: "" });
    setView(type === "search" ? "post-search" : "post-sublet");
  }

  function adminStartEdit(post) {
    setEditingPostId(post.id);
    setAdminPerson({ name: post.name, email: post.email, phone: post.phone || "", classYear: post.classYear });
    setForm({
      city: post.city, moveIn: post.moveIn, moveOut: post.moveOut, lifestyle: post.lifestyle || [],
      neighborhoods: post.neighborhoods || "", budgetMax: post.budgetMax || "", genderPref: post.genderPref || "No preference",
      furnished: post.furnished || "Either", beds: post.beds || (post.type === "search" ? [] : ""),
      baths: post.baths || (post.type === "search" ? [] : ""), bathPrivacy: post.bathPrivacy || "Shared bath OK",
      note: post.note || "", address: post.address || "", price: post.price || "",
      bedsAvail: post.bedsAvail || "1", description: post.description || "",
    });
    setView(post.type === "search" ? "post-search" : "post-sublet");
  }

  async function adminDeletePost(id) {
    if (!confirm("Delete this post?")) return;
    try {
      await adminApi(`/api/posts?id=${id}`, { method: "DELETE" }, adminSecret);
      await refreshPosts();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function adminSubmitPost(type) {
    if (!adminPerson.name || !adminPerson.email) { alert("Please fill in the name and email for the person"); return; }
    const data = {
      type, city: form.city, moveIn: form.moveIn, moveOut: form.moveOut, lifestyle: form.lifestyle || [],
      personName: adminPerson.name, personEmail: adminPerson.email,
      personPhone: adminPerson.phone, personClassYear: adminPerson.classYear,
    };
    if (type === "search") {
      if (!form.city || !form.moveIn || !form.moveOut) { alert("Please fill in city and dates"); return; }
      Object.assign(data, { neighborhoods: form.neighborhoods, budgetMax: form.budgetMax, genderPref: form.genderPref, furnished: form.furnished, beds: form.beds, baths: form.baths, bathPrivacy: form.bathPrivacy, note: form.note });
    } else {
      if (!form.city || !form.moveIn || !form.moveOut || !form.price) { alert("Please fill in city, dates, and price"); return; }
      Object.assign(data, { address: form.address, price: form.price, bedsAvail: form.bedsAvail, beds: form.beds, baths: form.baths, bathPrivacy: form.bathPrivacy, furnished: form.furnished, description: form.description });
    }
    try {
      if (editingPostId) {
        await adminApi(`/api/posts?id=${editingPostId}`, { method: "PUT", body: JSON.stringify(data) }, adminSecret);
        setEditingPostId(null);
      } else {
        await adminApi("/api/admin/posts", { method: "POST", body: JSON.stringify(data) }, adminSecret);
      }
      await refreshPosts();
      setView("cities");
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  const myPosts = user ? posts.filter(p => p.email === user.email) : [];

  // ─── STYLES ───
  const S = {
    app: { fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", minHeight: "100vh", background: "#FAFAF7", color: "#1a1a1a" },
    header: { background: "#fff", borderBottom: "1px solid #e8e5df", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, position: "sticky", top: 0, zIndex: 100 },
    logo: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", cursor: "pointer", letterSpacing: "-0.5px" },
    logoAcc: { color: "#c45d3e" },
    navBtn: { background: "none", border: "1px solid #d4d0c8", borderRadius: 8, padding: "8px 16px", fontSize: 14, cursor: "pointer", color: "#4a4a4a", fontFamily: "inherit", transition: "all 0.2s" },
    navAct: { background: "#1a1a1a", color: "#fff", borderColor: "#1a1a1a" },
    box: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
    h1: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 36, fontWeight: 700, marginBottom: 8, letterSpacing: "-1px" },
    sub: { color: "#7a7a7a", fontSize: 16, marginBottom: 32, lineHeight: 1.5 },
    authWrap: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", padding: 24 },
    authCard: { background: "#fff", borderRadius: 16, padding: "48px 40px", maxWidth: 440, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" },
    authH: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, marginBottom: 8 },
    authP: { color: "#7a7a7a", fontSize: 15, marginBottom: 32 },
    inp: { width: "100%", padding: "12px 16px", border: "1px solid #d4d0c8", borderRadius: 10, fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#FAFAF7" },
    codeInp: { width: "100%", padding: "16px", border: "1px solid #d4d0c8", borderRadius: 10, fontSize: 28, fontFamily: "'DM Sans', monospace", outline: "none", boxSizing: "border-box", background: "#FAFAF7", textAlign: "center", letterSpacing: "8px", fontWeight: 700 },
    lbl: { display: "block", fontSize: 13, fontWeight: 600, color: "#4a4a4a", marginBottom: 6, letterSpacing: "0.3px" },
    btn: { width: "100%", padding: "14px", background: "#c45d3e", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    btnDisabled: { width: "100%", padding: "14px", background: "#ccc", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: "not-allowed", fontFamily: "inherit" },
    btnSecondary: { width: "100%", padding: "12px", background: "none", color: "#7a7a7a", border: "1px solid #d4d0c8", borderRadius: 10, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 12 },
    errMsg: { color: "#c45d3e", fontSize: 14, marginBottom: 16, padding: "10px 14px", background: "#fdf2ef", borderRadius: 8 },
    successMsg: { color: "#2d7a2d", fontSize: 14, marginBottom: 16, padding: "10px 14px", background: "#f0f7f0", borderRadius: 8 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 },
    cCard: { background: "#fff", borderRadius: 14, padding: "24px", cursor: "pointer", border: "1px solid #e8e5df", transition: "all 0.25s" },
    cEmoji: { fontSize: 36, marginBottom: 12 },
    cName: { fontSize: 18, fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif" },
    cState: { color: "#999", fontSize: 13, marginLeft: 6 },
    cStat: { fontSize: 13, color: "#7a7a7a", marginTop: 8 },
    cNum: { fontWeight: 700, color: "#c45d3e" },
    tabs: { display: "flex", gap: 4, background: "#eeebe4", borderRadius: 12, padding: 4, width: "fit-content" },
    tabBtn: { padding: "10px 24px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: "transparent", color: "#7a7a7a" },
    tabAct: { background: "#fff", color: "#1a1a1a", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
    fInp: { padding: "8px 14px", border: "1px solid #d4d0c8", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff", outline: "none", minWidth: 120 },
    fSel: { padding: "8px 14px", border: "1px solid #d4d0c8", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff", outline: "none", cursor: "pointer", minWidth: 100 },
    card: { background: "#fff", borderRadius: 14, padding: "24px", border: "1px solid #e8e5df", marginBottom: 14, cursor: "pointer", transition: "all 0.2s" },
    cardExp: { borderColor: "#c45d3e", boxShadow: "0 2px 12px rgba(196,93,62,0.1)" },
    cH: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
    cNm: { fontSize: 17, fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif" },
    cYr: { fontSize: 12, color: "#999", background: "#f5f3ef", padding: "3px 10px", borderRadius: 20, fontWeight: 600 },
    meta: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#666", marginBottom: 10, lineHeight: 1.7 },
    nTag: { display: "inline-block", padding: "4px 12px", background: "#eef2ff", borderRadius: 20, fontSize: 12, color: "#4361b8", marginRight: 6, marginBottom: 6, fontWeight: 600 },
    tag: { display: "inline-block", padding: "4px 12px", background: "#f5f3ef", borderRadius: 20, fontSize: 12, color: "#666", marginRight: 6, marginBottom: 6, fontWeight: 500 },
    bTag: { display: "inline-block", padding: "4px 12px", background: "#f5efe8", borderRadius: 20, fontSize: 12, color: "#8a6d3b", marginRight: 6, marginBottom: 6, fontWeight: 700, border: "1px solid #e8dcc8" },
    ctBox: { marginTop: 16, padding: "16px", background: "#fdf8f5", borderRadius: 10, border: "1px solid #f0e4db" },
    ctH: { fontSize: 12, fontWeight: 700, color: "#c45d3e", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" },
    ctL: { color: "#1a1a1a", textDecoration: "none", fontSize: 14, fontWeight: 500 },
    fWrap: { maxWidth: 640, margin: "0 auto" },
    fRow: { marginBottom: 20 },
    fGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    tArea: { width: "100%", padding: "12px 16px", border: "1px solid #d4d0c8", borderRadius: 10, fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", minHeight: 80, resize: "vertical", background: "#FAFAF7" },
    tSel: { display: "flex", flexWrap: "wrap", gap: 8 },
    tOpt: { padding: "8px 16px", borderRadius: 20, border: "1px solid #d4d0c8", fontSize: 13, cursor: "pointer", fontFamily: "inherit", background: "#fff" },
    tAct: { background: "#1a1a1a", color: "#fff", borderColor: "#1a1a1a" },
    tActG: { background: "#8a6d3b", color: "#fff", borderColor: "#8a6d3b" },
    back: { background: "none", border: "none", fontSize: 14, color: "#7a7a7a", cursor: "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", gap: 6, marginBottom: 24 },
    empty: { textAlign: "center", padding: "60px 24px", color: "#999" },
    postBtn: { display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", background: "#c45d3e", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
    delBtn: { background: "none", border: "1px solid #e0c0b0", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#c45d3e", cursor: "pointer", fontFamily: "inherit" },
    badge: { background: "#c45d3e", color: "#fff", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700, marginLeft: 8 },
    hint: { fontSize: 12, color: "#999", marginTop: 4 },
    footer: { textAlign: "center", padding: "32px 24px 24px", fontSize: 12, color: "#c0bcb4" },
    footerLink: { color: "#c0bcb4", textDecoration: "none", borderBottom: "1px solid #ddd9d0" },
  };

  // ─── ADMIN LOGIN ───
  if (isAdminMode && !adminUnlocked) {
    return (
      <div style={S.app}>
        <div style={S.header}><div style={S.logo}>gsb<span style={S.logoAcc}>house</span><span style={{ fontSize: 11, fontWeight: 400, color: "#999", marginLeft: 6 }}>admin</span></div></div>
        <div style={S.authWrap}>
          <div style={S.authCard}>
            <div style={S.authH}>Admin Panel</div>
            <div style={S.authP}>Enter the admin secret to manage posts.</div>
            {adminError && <div style={S.errMsg}>{adminError}</div>}
            <div style={S.fRow}>
              <label style={S.lbl}>Admin Secret</label>
              <input style={S.inp} type="password" placeholder="Enter admin secret" value={adminSecretInput}
                onChange={e => { setAdminSecretInput(e.target.value); setAdminError(""); }}
                onKeyDown={e => e.key === "Enter" && !adminLoading && handleAdminUnlock()}
                autoFocus
              />
            </div>
            <button style={adminLoading ? S.btnDisabled : S.btn} onClick={handleAdminUnlock} disabled={adminLoading}>
              {adminLoading ? "Verifying..." : "Unlock →"}
            </button>
          </div>
        </div>
        <div style={S.footer}>Made by <a href="https://github.com/ADA110/gsb_housing" target="_blank" rel="noopener noreferrer" style={S.footerLink}>Abhi Ashar, Austin Jia &amp; Shivam Kalkar</a></div>
      </div>
    );
  }

  // ─── AUTH SCREENS ───
  if (!user && !adminUnlocked) {
    return (
      <div style={S.app}>
        <div style={S.header}><div style={S.logo}>gsb<span style={S.logoAcc}>house</span></div></div>
        <div style={S.authWrap}>
          <div style={S.authCard}>

            {/* Step 1: Email */}
            {authStep === "email" && (<>
              <div style={S.authH}>Find your people,<br/>find your place.</div>
              <div style={S.authP}>Housing matching for GSB students. We'll send a verification code to your Stanford email.</div>
              {authError && <div style={S.errMsg}>{authError}</div>}
              <div style={S.fRow}>
                <label style={S.lbl}>Stanford Email</label>
                <input style={S.inp} type="email" placeholder="you@stanford.edu" value={authEmail} onChange={e => { setAuthEmail(e.target.value); setAuthError(""); }} onKeyDown={e => e.key === "Enter" && !authLoading && handleSendCode()} />
              </div>
              <button style={authLoading ? S.btnDisabled : S.btn} onClick={handleSendCode} disabled={authLoading}>
                {authLoading ? "Sending code..." : "Send verification code →"}
              </button>
            </>)}

            {/* Step 2: Verify Code */}
            {authStep === "code" && (<>
              <div style={S.authH}>Check your email</div>
              <div style={S.authP}>We sent a 6-digit code to <strong>{authEmail}</strong></div>
              {codeSentMessage && <div style={S.successMsg}>{codeSentMessage}</div>}
              {authError && <div style={S.errMsg}>{authError}</div>}
              <div style={S.fRow}>
                <label style={S.lbl}>Verification Code</label>
                <input
                  style={S.codeInp}
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={authCode}
                  onChange={e => { setAuthCode(e.target.value.replace(/\D/g, "")); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && !authLoading && handleVerifyCode()}
                  autoFocus
                />
              </div>
              <button style={authLoading ? S.btnDisabled : S.btn} onClick={handleVerifyCode} disabled={authLoading}>
                {authLoading ? "Verifying..." : "Verify →"}
              </button>
              <button style={S.btnSecondary} onClick={() => { setAuthStep("email"); setAuthCode(""); setAuthError(""); setCodeSentMessage(""); }}>
                ← Use a different email
              </button>
              <button style={{...S.btnSecondary, marginTop: 8}} onClick={async () => {
                setAuthLoading(true); setAuthError("");
                try {
                  await api("/api/send-code", { method: "POST", body: JSON.stringify({ email: authEmail }) });
                  setCodeSentMessage("New code sent!");
                  setAuthCode("");
                } catch (err) { setAuthError(err.message); }
                setAuthLoading(false);
              }} disabled={authLoading}>
                Resend code
              </button>
            </>)}

            {/* Step 3: Profile Setup */}
            {authStep === "profile" && (<>
              <div style={S.authH}>Almost there</div>
              <div style={S.authP}>Set up your profile so classmates can find and reach you.</div>
              {authError && <div style={S.errMsg}>{authError}</div>}
              <div style={S.fRow}><label style={S.lbl}>Full Name</label><input style={S.inp} placeholder="Your name" value={authName} onChange={e => setAuthName(e.target.value)} /></div>
              <div style={S.fRow}><label style={S.lbl}>Phone (optional)</label><input style={S.inp} placeholder="(555) 123-4567" value={authPhone} onChange={e => setAuthPhone(e.target.value)} /></div>
              <div style={S.fRow}>
                <label style={S.lbl}>Class Year</label>
                <select style={{...S.inp, cursor: "pointer"}} value={authYear} onChange={e => setAuthYear(e.target.value)}>
                  <option value="2026">2026</option><option value="2027">2027</option>
                </select>
              </div>
              <button style={authLoading ? S.btnDisabled : S.btn} onClick={handleCreateProfile} disabled={authLoading}>
                {authLoading ? "Creating profile..." : "Create Profile →"}
              </button>
            </>)}
          </div>
        </div>
        <div style={S.footer}>Made by <a href="https://github.com/ADA110/gsb_housing" target="_blank" rel="noopener noreferrer" style={S.footerLink}>Abhi Ashar, Austin Jia &amp; Shivam Kalkar</a></div>
      </div>
    );
  }

  // ─── CARD: Search ───
  function SearchCard({ item }) {
    const exp = expandedCard === item.id;
    return (
      <div style={{...S.card, ...(exp ? S.cardExp : {})}} onClick={() => setExpandedCard(exp ? null : item.id)}>
        <div style={S.cH}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={S.cNm}>{item.name}</span>
            <span style={S.cYr}>Class of {item.classYear}</span>
          </div>
          <span style={{ fontSize: 12, color: "#bbb" }}>{daysAgo(item.createdAt)}</span>
        </div>
        <div style={S.meta}>
          <span>📅 {formatDate(item.moveIn)} – {formatDate(item.moveOut)}</span>
          <span>💰 Up to ${item.budgetMax}/mo per person</span>
          {item.genderPref !== "No preference" && <span>👤 {item.genderPref} pref</span>}
          {item.furnished !== "Either" && <span>🪑 {item.furnished}</span>}
        </div>
        {item.neighborhoods && item.neighborhoods !== "Any" && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600, marginRight: 8, textTransform: "uppercase", letterSpacing: "0.3px" }}>Neighborhoods:</span>
            {item.neighborhoods.split(",").map(n => n.trim()).filter(Boolean).map(n => <span key={n} style={S.nTag}>📍 {n}</span>)}
          </div>
        )}
        {item.neighborhoods === "Any" && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600, marginRight: 8, textTransform: "uppercase", letterSpacing: "0.3px" }}>Neighborhoods:</span>
            <span style={S.nTag}>📍 Any / Flexible</span>
          </div>
        )}
        <div>
          {(item.beds || []).length > 0 && <span style={S.bTag}>🛏 {(item.beds || []).join(", ")} BD</span>}
          {(item.baths || []).length > 0 && <span style={S.bTag}>🚿 {(item.baths || []).join(", ")} BA</span>}
          {item.bathPrivacy && <span style={S.bTag}>{item.bathPrivacy === "Private bath" ? "🔒" : "🤝"} {item.bathPrivacy}</span>}
          {(item.lifestyle || []).map(t => <span key={t} style={S.tag}>{t}</span>)}
        </div>
        {exp && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
            {item.note && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.6, margin: "0 0 16px 0" }}>{item.note}</p>}
            <div style={S.ctBox}>
              <div style={S.ctH}>Contact {item.name.split(" ")[0]}</div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <a href={`mailto:${item.email}`} style={S.ctL}>✉ {item.email}</a>
                {item.phone && <a href={`tel:${item.phone}`} style={S.ctL}>📱 {item.phone}</a>}
              </div>
            </div>
            {user.email === item.email && <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={{...S.delBtn, color: "#4361b8", borderColor: "#c0c8e8"}} onClick={e => { e.stopPropagation(); startEdit(item); }}>Edit</button><button style={S.delBtn} onClick={e => { e.stopPropagation(); deletePost(item.id); }}>Remove Post</button></div>}
          </div>
        )}
      </div>
    );
  }

  // ─── CARD: Sublet ───
  function SubletCard({ item }) {
    const exp = expandedCard === item.id;
    return (
      <div style={{...S.card, ...(exp ? S.cardExp : {})}} onClick={() => setExpandedCard(exp ? null : item.id)}>
        <div style={S.cH}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={S.cNm}>{item.name}</span>
            <span style={S.cYr}>Class of {item.classYear}</span>
          </div>
          <span style={{ fontSize: 12, color: "#bbb" }}>{daysAgo(item.createdAt)}</span>
        </div>
        <div style={S.meta}>
          <span>📅 {formatDate(item.moveIn)} – {formatDate(item.moveOut)}</span>
          <span>💰 ${item.price}/mo</span>
          {item.bedsAvail && <span>🛏 {item.bedsAvail} of {item.beds} BR avail</span>}
          {item.furnished !== "Either" && <span>🪑 {item.furnished}</span>}
        </div>
        {item.address && <div style={{ marginBottom: 8 }}><span style={S.nTag}>📍 {item.address}</span></div>}
        <div>
          {item.beds && <span style={S.bTag}>🛏 {item.beds} BD</span>}
          {item.baths && <span style={S.bTag}>🚿 {item.baths} BA</span>}
          {item.bathPrivacy && <span style={S.bTag}>{item.bathPrivacy === "Private bath" ? "🔒" : "🤝"} {item.bathPrivacy}</span>}
          {(item.lifestyle || []).map(t => <span key={t} style={S.tag}>{t}</span>)}
        </div>
        {exp && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
            {item.description && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.6, margin: "0 0 16px 0" }}>{item.description}</p>}
            <div style={S.ctBox}>
              <div style={S.ctH}>Contact {item.name.split(" ")[0]}</div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <a href={`mailto:${item.email}`} style={S.ctL}>✉ {item.email}</a>
                {item.phone && <a href={`tel:${item.phone}`} style={S.ctL}>📱 {item.phone}</a>}
              </div>
            </div>
            {user.email === item.email && <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={{...S.delBtn, color: "#4361b8", borderColor: "#c0c8e8"}} onClick={e => { e.stopPropagation(); startEdit(item); }}>Edit</button><button style={S.delBtn} onClick={e => { e.stopPropagation(); deletePost(item.id); }}>Remove Post</button></div>}
          </div>
        )}
      </div>
    );
  }

  // ─── CITY VIEW ───
  function renderCityView() {
    const searches = getCityPosts("search");
    const sublets = getCityPosts("sublet");
    const items = tab === "looking" ? searches : sublets;
    return (
      <div style={S.box}>
        <button style={S.back} onClick={() => setView("cities")}>← All Cities</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{...S.h1, display: "flex", alignItems: "center", gap: 12 }}>{selectedCity.emoji} {selectedCity.name}</h1>
            <div style={{ color: "#7a7a7a", fontSize: 15 }}>{searches.length} looking for roommates · {sublets.length} sublets available</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={S.postBtn} onClick={() => startPost("search")}>+ I'm Looking</button>
            <button style={{...S.postBtn, background: "#1a1a1a"}} onClick={() => startPost("sublet")}>+ List Sublet</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={S.tabs}>
            <button style={{...S.tabBtn, ...(tab === "looking" ? S.tabAct : {})}} onClick={() => setTab("looking")}>Looking for Roommates {searches.length > 0 && <span style={S.badge}>{searches.length}</span>}</button>
            <button style={{...S.tabBtn, ...(tab === "sublets" ? S.tabAct : {})}} onClick={() => setTab("sublets")}>Sublets Available {sublets.length > 0 && <span style={S.badge}>{sublets.length}</span>}</button>
          </div>
          <button style={{...S.navBtn, ...(showFilters ? { background: "#f5f3ef" } : {})}} onClick={() => setShowFilters(!showFilters)}>⚙ Filters</button>
        </div>
        {showFilters && (
          <div style={{ background: "#fff", borderRadius: 12, padding: "20px", border: "1px solid #e8e5df", marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div><label style={{...S.lbl, marginBottom: 4}}>From</label><input type="date" style={S.fInp} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} /></div>
              <div><label style={{...S.lbl, marginBottom: 4}}>To</label><input type="date" style={S.fInp} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} /></div>
              <div><label style={{...S.lbl, marginBottom: 4}}>Max $/mo per person</label><input type="number" style={S.fInp} placeholder="$/mo" value={filterBudgetMax} onChange={e => setFilterBudgetMax(e.target.value)} /></div>
              {tab === "looking" && <div><label style={{...S.lbl, marginBottom: 4}}>Gender</label><select style={S.fSel} value={filterGender} onChange={e => setFilterGender(e.target.value)}><option value="">Any</option>{GENDER_PREFS.map(g => <option key={g}>{g}</option>)}</select></div>}
              <div><label style={{...S.lbl, marginBottom: 4}}>Furnished</label><select style={S.fSel} value={filterFurnished} onChange={e => setFilterFurnished(e.target.value)}><option value="">Any</option><option>Furnished</option><option>Unfurnished</option></select></div>
              <div><label style={{...S.lbl, marginBottom: 4}}>Beds</label><select style={S.fSel} value={filterBeds} onChange={e => setFilterBeds(e.target.value)}><option value="">Any</option>{BD_OPTIONS.map(b => <option key={b} value={b}>{b} BD</option>)}</select></div>
              <div><label style={{...S.lbl, marginBottom: 4}}>Baths</label><select style={S.fSel} value={filterBaths} onChange={e => setFilterBaths(e.target.value)}><option value="">Any</option>{BA_OPTIONS.map(b => <option key={b} value={b}>{b} BA</option>)}</select></div>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{tab === "looking" ? "🔍" : "🏠"}</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No {tab === "looking" ? "roommate searches" : "sublets"} yet</div>
            <div>Be the first to post in {selectedCity.name}!</div>
          </div>
        ) : items.map(item => item.type === "search" ? <SearchCard key={item.id} item={item} /> : <SubletCard key={item.id} item={item} />)}
      </div>
    );
  }

  // ─── POST FORM ───
  function renderPostForm(type) {
    const isS = type === "search";
    return (
      <div style={S.box}>
        <div style={S.fWrap}>
          <button style={S.back} onClick={() => isAdminMode ? setView("cities") : (selectedCity ? openCity(selectedCity) : setView("cities"))}>← Back</button>
          <h1 style={{...S.h1, fontSize: 28}}>{editingPostId ? "Edit Post" : (isS ? "I'm Looking for Housing" : "List a Sublet")}</h1>
          <p style={S.sub}>{editingPostId ? "Update your post details below." : (isS ? "Tell us where you're headed and what you need. We'll help you find classmates with matching plans." : "Share your place with classmates who need housing.")}</p>
          {isAdminMode && (
            <div style={{ marginBottom: 24, padding: 16, background: "#eef2ff", borderRadius: 10, border: "1px solid #c0cef8" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4361b8", marginBottom: 12 }}>Posting on behalf of</div>
              <div style={S.fGrid}>
                <div style={S.fRow}><label style={S.lbl}>Full Name</label><input style={S.inp} placeholder="Student name" value={adminPerson.name} onChange={e => setAdminPerson({...adminPerson, name: e.target.value})} /></div>
                <div style={S.fRow}><label style={S.lbl}>Email</label><input style={S.inp} placeholder="student@stanford.edu" value={adminPerson.email} onChange={e => setAdminPerson({...adminPerson, email: e.target.value})} /></div>
              </div>
              <div style={S.fGrid}>
                <div style={S.fRow}><label style={S.lbl}>Phone (optional)</label><input style={S.inp} placeholder="(555) 123-4567" value={adminPerson.phone} onChange={e => setAdminPerson({...adminPerson, phone: e.target.value})} /></div>
                <div style={S.fRow}><label style={S.lbl}>Class Year</label><select style={{...S.inp, cursor: "pointer"}} value={adminPerson.classYear} onChange={e => setAdminPerson({...adminPerson, classYear: e.target.value})}><option value="2026">2026</option><option value="2027">2027</option></select></div>
              </div>
            </div>
          )}
          <div style={S.fRow}><label style={S.lbl}>City</label><select style={{...S.inp, cursor: "pointer"}} value={form.city} onChange={e => setForm({...form, city: e.target.value})}><option value="">Select a city</option>{CITIES.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}</select></div>
          {isS ? (
            <div style={S.fRow}>
              <label style={S.lbl}>Preferred Neighborhoods</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button style={{...S.tOpt, ...(form.neighborhoods === "Any" ? S.tAct : {})}} onClick={() => setForm({...form, neighborhoods: "Any"})}>Any / Flexible</button>
                <button style={{...S.tOpt, ...(form.neighborhoods !== "Any" && form.neighborhoods !== "" ? { borderColor: "#1a1a1a", color: "#1a1a1a" } : {})}} onClick={() => { if (form.neighborhoods === "Any") setForm({...form, neighborhoods: ""}); }}>Specific neighborhoods</button>
              </div>
              {form.neighborhoods !== "Any" && (<><input style={S.inp} placeholder="e.g. SOMA, Mission, Marina (comma-separated)" value={form.neighborhoods === "Any" ? "" : form.neighborhoods} onChange={e => setForm({...form, neighborhoods: e.target.value})} /><div style={S.hint}>Separate multiple neighborhoods with commas</div></>)}
            </div>
          ) : (
            <div style={S.fRow}><label style={S.lbl}>Address / Neighborhood</label><input style={S.inp} placeholder="e.g. Mission District, near 24th St BART" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
          )}
          <div style={S.fRow}><div style={S.fGrid}><div><label style={S.lbl}>Move-in Date</label><input type="date" style={S.inp} value={form.moveIn} onChange={e => setForm({...form, moveIn: e.target.value})} /></div><div><label style={S.lbl}>Move-out Date</label><input type="date" style={S.inp} value={form.moveOut} onChange={e => setForm({...form, moveOut: e.target.value})} /></div></div></div>
          {isS ? (
            <div style={S.fRow}><label style={S.lbl}>Max Budget Per Person ($/mo)</label><input type="number" style={S.inp} placeholder="2000" value={form.budgetMax} onChange={e => setForm({...form, budgetMax: e.target.value})} /><div style={S.hint}>Your max monthly spend — apartment size is flexible</div></div>
          ) : (<>
            <div style={S.fRow}><div style={S.fGrid}>
              <div><label style={S.lbl}>Monthly Rent ($)</label><input type="number" style={S.inp} placeholder="1500" value={form.price} onChange={e => setForm({...form, price: e.target.value})} /></div>
              <div><label style={S.lbl}>Bedrooms Available</label><select style={{...S.inp, cursor: "pointer"}} value={form.bedsAvail} onChange={e => setForm({...form, bedsAvail: e.target.value})}><option>1</option><option>2</option><option>3</option><option>4</option></select></div>
            </div></div>
            <div style={S.fRow}><div style={S.fGrid}>
              <div><label style={S.lbl}>Total Bedrooms</label><div style={{ display: "flex", gap: 8 }}>{BD_OPTIONS.map(b => <button key={b} style={{...S.tOpt, ...(form.beds === b ? S.tActG : {})}} onClick={() => setForm({...form, beds: b})}>{b}</button>)}</div></div>
              <div><label style={S.lbl}>Total Bathrooms</label><div style={{ display: "flex", gap: 8 }}>{BA_OPTIONS.map(b => <button key={b} style={{...S.tOpt, ...(form.baths === b ? S.tActG : {})}} onClick={() => setForm({...form, baths: b})}>{b}</button>)}</div></div>
            </div></div>
            <div style={S.fRow}><div style={S.fGrid}>
              <div><label style={S.lbl}>Bath Privacy</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["Private bath", "Shared bath"].map(b => <button key={b} style={{...S.tOpt, ...(form.bathPrivacy === b ? S.tActG : {})}} onClick={() => setForm({...form, bathPrivacy: b})}>{b}</button>)}</div></div>
              <div><label style={S.lbl}>Furnished</label><select style={{...S.inp, cursor: "pointer"}} value={form.furnished} onChange={e => setForm({...form, furnished: e.target.value})}><option>Either</option><option>Furnished</option><option>Unfurnished</option></select></div>
            </div></div>
          </>)}
          {isS && (<div style={S.fRow}><label style={S.lbl}>Furnished</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{["Either", "Furnished", "Unfurnished"].map(f => <button key={f} style={{...S.tOpt, ...(form.furnished === f ? S.tAct : {})}} onClick={() => setForm({...form, furnished: f})}>{f}</button>)}</div></div>)}
          {isS && (<div style={S.fRow}><label style={S.lbl}>Bedrooms You'd Consider</label><div style={S.hint}>Select all that work for you</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>{BD_OPTIONS.map(b => <button key={b} style={{...S.tOpt, ...((form.beds || []).includes(b) ? S.tActG : {})}} onClick={() => { const ls = form.beds || []; setForm({...form, beds: ls.includes(b) ? ls.filter(x => x !== b) : [...ls, b]}); }}>{b} BD</button>)}</div></div>)}
          {isS && (<div style={S.fRow}><label style={S.lbl}>Bathrooms You'd Consider</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>{BA_OPTIONS.map(b => <button key={b} style={{...S.tOpt, ...((form.baths || []).includes(b) ? S.tActG : {})}} onClick={() => { const ls = form.baths || []; setForm({...form, baths: ls.includes(b) ? ls.filter(x => x !== b) : [...ls, b]}); }}>{b} BA</button>)}</div></div>)}
          {isS && (<div style={S.fRow}><label style={S.lbl}>Bath Privacy</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{BATH_PRIVACY.map(b => <button key={b} style={{...S.tOpt, ...(form.bathPrivacy === b ? S.tActG : {})}} onClick={() => setForm({...form, bathPrivacy: b})}>{b}</button>)}</div></div>)}
          {isS && (<div style={S.fRow}><label style={S.lbl}>Gender Preference</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{GENDER_PREFS.map(g => <button key={g} style={{...S.tOpt, ...(form.genderPref === g ? S.tAct : {})}} onClick={() => setForm({...form, genderPref: g})}>{g}</button>)}</div></div>)}
          <div style={S.fRow}><label style={S.lbl}>Lifestyle Tags</label><div style={S.tSel}>{LIFESTYLE_TAGS.map(t => <button key={t} style={{...S.tOpt, ...((form.lifestyle || []).includes(t) ? S.tAct : {})}} onClick={() => { const ls = form.lifestyle || []; setForm({...form, lifestyle: ls.includes(t) ? ls.filter(x => x !== t) : [...ls, t]}); }}>{t}</button>)}</div></div>
          <div style={S.fRow}><label style={S.lbl}>{isS ? "Notes (anything else classmates should know)" : "Description"}</label><textarea style={S.tArea} placeholder={isS ? "What company, any other preferences, etc." : "Tell classmates about the apartment..."} value={isS ? (form.note || "") : (form.description || "")} onChange={e => setForm({...form, [isS ? "note" : "description"]: e.target.value})} /></div>
          <button style={{...S.btn, marginTop: 8}} onClick={() => isAdminMode ? adminSubmitPost(type) : submitPost(type)}>{editingPostId ? "Save Changes" : (isS ? "Post Housing Search" : "List Sublet")} →</button>
        </div>
      </div>
    );
  }

  // ─── MY POSTS ───
  function renderMyPosts() {
    return (
      <div style={S.box}>
        <h1 style={S.h1}>My Posts</h1>
        <p style={S.sub}>Manage your housing searches and sublet listings.</p>
        {myPosts.length === 0 ? (
          <div style={S.empty}><div style={{ fontSize: 48, marginBottom: 16 }}>📝</div><div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No posts yet</div><div>Browse cities and create your first post!</div></div>
        ) : myPosts.map(p => (
          <div key={p.id} style={S.card}>
            <div style={S.cH}>
              <div><span style={{ fontSize: 11, fontWeight: 700, color: p.type === "search" ? "#c45d3e" : "#2d7a2d", textTransform: "uppercase", letterSpacing: "0.5px" }}>{p.type === "search" ? "Looking" : "Sublet"}</span><div style={S.cNm}>{p.city}</div></div>
              <div style={{ display: "flex", gap: 8 }}><button style={{...S.delBtn, color: "#4361b8", borderColor: "#c0c8e8"}} onClick={() => startEdit(p)}>Edit</button><button style={S.delBtn} onClick={() => deletePost(p.id)}>Remove</button></div>
            </div>
            <div style={S.meta}>
              <span>📅 {formatDate(p.moveIn)} – {formatDate(p.moveOut)}</span>
              {p.type === "search" ? <span>💰 Up to ${p.budgetMax}/mo pp</span> : <span>💰 ${p.price}/mo</span>}
            </div>
            {p.neighborhoods && <div>{(p.neighborhoods === "Any" ? ["Any / Flexible"] : p.neighborhoods.split(",").map(n => n.trim()).filter(Boolean)).map(n => <span key={n} style={S.nTag}>📍 {n}</span>)}</div>}
            {p.address && <div><span style={S.nTag}>📍 {p.address}</span></div>}
          </div>
        ))}
      </div>
    );
  }

  // ─── ADMIN PANEL ───
  function renderAdminPanel() {
    const sorted = [...posts].sort((a, b) => b.createdAt - a.createdAt);
    return (
      <div style={S.box}>
        <h1 style={S.h1}>All Posts</h1>
        <p style={S.sub}>{sorted.length} total · {posts.filter(p => p.type === "search").length} searches · {posts.filter(p => p.type === "sublet").length} sublets</p>
        {sorted.length === 0 ? (
          <div style={S.empty}><div style={{ fontSize: 48, marginBottom: 16 }}>📋</div><div>No posts yet. Add the first one!</div></div>
        ) : sorted.map(p => (
          <div key={p.id} style={S.card}>
            <div style={S.cH}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.type === "search" ? "#c45d3e" : "#2d7a2d", textTransform: "uppercase", letterSpacing: "0.5px" }}>{p.type === "search" ? "Looking" : "Sublet"}</span>
                <div style={{...S.cNm, marginTop: 2}}>{p.name} · {p.city}</div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{p.email} · Class of {p.classYear}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{...S.delBtn, color: "#4361b8", borderColor: "#c0c8e8"}} onClick={() => adminStartEdit(p)}>Edit</button>
                <button style={S.delBtn} onClick={() => adminDeletePost(p.id)}>Delete</button>
              </div>
            </div>
            <div style={S.meta}>
              <span>📅 {formatDate(p.moveIn)} – {formatDate(p.moveOut)}</span>
              {p.type === "search" ? <span>💰 Up to ${p.budgetMax}/mo</span> : <span>💰 ${p.price}/mo</span>}
              {p.type === "sublet" && p.address && <span>📍 {p.address}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── MAIN ───
  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={S.logo} onClick={() => setView("cities")}>gsb<span style={S.logoAcc}>house</span>{isAdminMode && <span style={{ fontSize: 11, fontWeight: 400, color: "#999", marginLeft: 6 }}>admin</span>}</div>
        {isAdminMode && adminUnlocked ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={S.postBtn} onClick={() => adminStartPost("search")}>+ Search Post</button>
            <button style={{...S.postBtn, background: "#1a1a1a"}} onClick={() => adminStartPost("sublet")}>+ Sublet</button>
            <button style={{...S.navBtn, fontSize: 12, padding: "6px 12px"}} onClick={() => { setAdminUnlocked(false); setAdminSecret(""); setAdminSecretInput(""); }}>Lock</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button style={{...S.navBtn, ...(view === "my-posts" ? S.navAct : {})}} onClick={() => setView("my-posts")}>My Posts {myPosts.length > 0 && <span style={{ fontWeight: 700, marginLeft: 4 }}>({myPosts.length})</span>}</button>
            <div style={{ fontSize: 14, color: "#7a7a7a" }}>{user.name}</div>
            <button style={{...S.navBtn, fontSize: 12, padding: "6px 12px"}} onClick={handleLogout}>Sign Out</button>
          </div>
        )}
      </div>
      {loading ? <div style={{ textAlign: "center", padding: 80, color: "#999" }}>Loading...</div>
      : isAdminMode && adminUnlocked ? (
        view === "post-search" ? renderPostForm("search")
        : view === "post-sublet" ? renderPostForm("sublet")
        : renderAdminPanel()
      ) : view === "cities" ? (
        <div style={S.box}>
          <h1 style={S.h1}>Where are you headed?</h1>
          <p style={S.sub}>Pick a city to see who's looking for roommates and what sublets are available.</p>
          <div style={S.grid}>
            {CITIES.map(city => {
              const c = getCityCounts(city.name);
              return (
                <div key={city.name} style={S.cCard} onClick={() => openCity(city)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#c45d3e"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e8e5df"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={S.cEmoji}>{city.emoji}</div>
                  <div style={{ display: "flex", alignItems: "baseline" }}>
                    <span style={S.cName}>{city.name}</span>
                    {city.state && <span style={S.cState}>{city.state}</span>}
                  </div>
                  {(c.searches + c.sublets) > 0
                    ? <div style={S.cStat}><span style={S.cNum}>{c.searches}</span> looking · <span style={S.cNum}>{c.sublets}</span> sublets</div>
                    : <div style={S.cStat}>No activity yet</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "city" ? renderCityView()
      : view === "post-search" ? renderPostForm("search")
      : view === "post-sublet" ? renderPostForm("sublet")
      : view === "my-posts" ? renderMyPosts()
      : null}
      <div style={S.footer}>Made by <a href="https://github.com/ADA110/gsb_housing" target="_blank" rel="noopener noreferrer" style={S.footerLink}>Abhi Ashar, Austin Jia &amp; Shivam Kalkar</a></div>
    </div>
  );
}
