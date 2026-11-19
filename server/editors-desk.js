// The Editor's Desk API: a dev-server-only plugin (see vite.config.js). Never part of the built site.
//
// Auth model
//   • First run: no .admin-auth.json yet, so ADMIN_USER + ADMIN_PASSWORD from .env unlock the desk,
//     and the session is forced to choose a new password before anything else works.
//   • After that the .env password stops working. The chosen password is stored only as a salted
//     scrypt hash in .admin-auth.json (git-ignored). Delete that file to fall back to setup mode.
//   • Sessions: random token in an HttpOnly, SameSite=Strict cookie, held in memory (restart = log in again).
//   • Only requests from this computer are served, and writes must come from a localhost page.

import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { CATEGORIES, REWARDS, PICKERS, MEALS, slug } from "../categories.js";

const scrypt = promisify(scryptCallback);
const DATA_FILE = fileURLToPath(new URL("../places.json", import.meta.url));
const AUTH_FILE = fileURLToPath(new URL("../.admin-auth.json", import.meta.url));

const SESSION_HOURS = 12;
const MIN_PASSWORD_LENGTH = 10;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;
const COOKIE = "desk_session";

/* ——— Places ——— */

const FIELD_ORDER = ["name", "category", "type", "neighborhood", "alsoIn", "budget", "cuisine", "meal", "picks", "closed",
  "rewards", "when", "season", "lat", "lng", "url", "summary", "description"];
const REQUIRED = ["name", "category", "type", "neighborhood", "budget", "summary", "description"];

/** Clean and validate one place from the editor. Returns [place, error]. */
function normalize(input) {
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  const list = (v) => (Array.isArray(v) ? [...new Set(v.map(text).filter(Boolean))] : []);
  const p = {
    name: text(input.name), category: text(input.category), type: text(input.type),
    neighborhood: text(input.neighborhood), alsoIn: list(input.alsoIn), budget: text(input.budget),
    cuisine: list(input.cuisine), meal: MEALS.filter((m) => list(input.meal).includes(m)),
    picks: list(input.picks).filter((w) => PICKERS.includes(w)),
    closed: input.closed === true, rewards: text(input.rewards), when: text(input.when),
    season: Array.isArray(input.season) && input.season.length === 4 && input.season.every(Number.isInteger) ? input.season : null,
    lat: Number(input.lat), lng: Number(input.lng), url: text(input.url),
    summary: text(input.summary), description: text(input.description),
  };
  const missing = REQUIRED.filter((k) => !p[k]);
  if (missing.length) return [null, `Missing: ${missing.join(", ")}`];
  if (!CATEGORIES[p.category]) return [null, `Unknown category "${p.category}"`];
  if (p.rewards && !REWARDS[p.rewards]) return [null, `Unknown rewards program "${p.rewards}"`];
  if (!(p.lat >= 41 && p.lat <= 43 && p.lng >= -89 && p.lng <= -87)) return [null, "Coordinates must be in the Chicago area"];
  if (p.url && !/^https?:\/\//i.test(p.url)) return [null, "Website must start with http:// or https://"];

  // Drop empty optional fields and keep a stable key order so diffs stay readable.
  const out = {};
  for (const k of FIELD_ORDER) {
    const v = p[k];
    if (v === "" || v === null || v === false || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  out.lat = Number(p.lat.toFixed(5));
  out.lng = Number(p.lng.toFixed(5));
  return [out, null];
}

const readPlaces = async () => JSON.parse(await readFile(DATA_FILE, "utf8"));
const writePlaces = (list) => writeFile(DATA_FILE, JSON.stringify(list, null, 2) + "\n");

/* ——— Passwords & sessions ——— */

async function hashPassword(user, password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return { user, algo: "scrypt", salt: salt.toString("hex"), hash: key.toString("hex"), updatedAt: new Date().toISOString() };
}

async function matchesStored(password, stored) {
  const key = await scrypt(password, Buffer.from(stored.salt, "hex"), 64);
  return timingSafeEqual(key, Buffer.from(stored.hash, "hex"));
}

const sha256 = (s) => createHash("sha256").update(String(s)).digest();
const sameSecret = (a, b) => timingSafeEqual(sha256(a), sha256(b));

async function readAuth() {
  try {
    return JSON.parse(await readFile(AUTH_FILE, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

const sessions = new Map(); // token -> { expires, mustChange }
let failures = 0;
let lockedUntil = 0;

function startSession(res, { mustChange }) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { expires: Date.now() + SESSION_HOURS * 3600_000, mustChange });
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_HOURS * 3600}`);
}

function endSession(req, res) {
  const token = readCookie(req);
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`);
}

function readCookie(req) {
  const match = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return match?.[1] ?? null;
}

function currentSession(req) {
  const token = readCookie(req);
  const session = token && sessions.get(token);
  if (!session) return null;
  if (session.expires < Date.now()) { sessions.delete(token); return null; }
  return session;
}

/* ——— HTTP helpers ——— */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches without Origin (older browsers); cookie is SameSite=Strict anyway
  try { return LOCAL_HOSTS.includes(new URL(origin).hostname); } catch { return false; }
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ——— Plugin ——— */

export function editorsDesk({ setupUser = "", setupPassword = "" } = {}) {
  setupUser = (setupUser || "").trim();
  setupPassword = (setupPassword || "").trim();
  const sameUser = (given, expected) => !expected || sameSecret(String(given).trim().toLowerCase(), expected.toLowerCase());

  return {
    name: "editors-desk-api",
    configureServer(server) {
      // Pretty URL: /editordesk serves editordesk.html.
      server.middlewares.use((req, res, next) => {
        if (/^\/editordesk\/?(\?.*)?$/.test(req.url)) req.url = req.url.replace(/^\/editordesk\/?/, "/editordesk.html");
        next();
      });

      server.middlewares.use("/api", async (req, res, next) => {
        // The dev server listens on the LAN (--host), so only this computer may use the editor.
        if (!isLocal(req)) return send(res, 403, { error: "The Editor's Desk only works on the computer running the dev server." });
        if (req.method !== "GET" && !sameOrigin(req)) return send(res, 403, { error: "Cross-site request blocked." });

        const url = new URL(req.url, "http://localhost");
        const path = url.pathname.replace(/\/+$/, "") || "/";

        try {
          /* ——— Auth endpoints ——— */
          if (path === "/auth/status" && req.method === "GET") {
            const stored = await readAuth();
            const session = currentSession(req);
            return send(res, 200, {
              authenticated: !!session,
              mustChange: !!session?.mustChange,
              firstRun: !stored,
              configured: !!(stored || setupPassword),
            });
          }

          if (path === "/auth/login" && req.method === "POST") {
            if (Date.now() < lockedUntil) {
              return send(res, 429, { error: `Too many wrong passwords. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)} seconds.` });
            }
            const { username = "", password = "" } = await readBody(req);
            const stored = await readAuth();
            if (!stored && !setupPassword) {
              return send(res, 503, { error: "No password is set up yet. Add ADMIN_PASSWORD to .env and restart npm run dev." });
            }
            const passwordOk = typeof password === "string" && password.length > 0 &&
              (stored ? await matchesStored(password, stored) : sameSecret(password, setupPassword));
            const ok = sameUser(username, stored?.user ?? setupUser) && passwordOk;
            if (!ok) {
              failures += 1;
              if (failures >= MAX_FAILURES) { lockedUntil = Date.now() + LOCKOUT_MS; failures = 0; }
              await pause(400);
              return send(res, 401, { error: "That username or password isn’t right." });
            }
            failures = 0;
            startSession(res, { mustChange: !stored });
            return send(res, 200, { mustChange: !stored });
          }

          if (path === "/auth/logout" && req.method === "POST") {
            endSession(req, res);
            return send(res, 200, { ok: true });
          }

          if (path === "/auth/change" && req.method === "POST") {
            const session = currentSession(req);
            if (!session) return send(res, 401, { error: "Please log in again." });
            const { current = "", next: nextPassword = "" } = await readBody(req);
            const stored = await readAuth();

            // A forced change right after a setup-password login doesn't need the old password again.
            if (!session.mustChange) {
              const ok = stored ? await matchesStored(String(current), stored) : sameSecret(current, setupPassword);
              if (!ok) { await pause(400); return send(res, 401, { error: "Your current password isn’t right." }); }
            }
            if (typeof nextPassword !== "string" || nextPassword.length < MIN_PASSWORD_LENGTH) {
              return send(res, 400, { error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` });
            }
            if (setupPassword && sameSecret(nextPassword, setupPassword)) {
              return send(res, 400, { error: "Choose something different from the setup password." });
            }

            const user = stored?.user ?? setupUser;
            await writeFile(AUTH_FILE, JSON.stringify(await hashPassword(user, nextPassword), null, 2) + "\n", { mode: 0o600 });
            sessions.clear(); // sign out every other session
            startSession(res, { mustChange: false });
            return send(res, 200, { ok: true });
          }

          /* ——— Everything below needs a signed-in session ——— */
          const session = currentSession(req);
          if (!session) return send(res, 401, { error: "Please log in.", loginRequired: true });
          if (session.mustChange) return send(res, 403, { error: "Choose a new password first.", mustChange: true });

          // Address → coordinates, via OpenStreetMap Nominatim (needs a real User-Agent, so it goes through here).
          if (path === "/geocode" && req.method === "GET") {
            const q = url.searchParams.get("q") || "";
            const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`, {
              headers: { "User-Agent": "chicago-field-guide-editor/1.0" },
            });
            const [hit] = await r.json();
            return hit
              ? send(res, 200, { lat: Number((+hit.lat).toFixed(5)), lng: Number((+hit.lon).toFixed(5)), label: hit.display_name })
              : send(res, 404, { error: "No match for that address." });
          }

          const match = path.match(/^\/places(?:\/([a-z0-9-]+))?$/);
          if (!match) return next();
          const id = match[1];
          const list = await readPlaces();
          const index = id ? list.findIndex((p) => slug(p.name) === id) : -1;
          const nameTaken = (name, except = -1) => list.some((p, i) => i !== except && slug(p.name) === slug(name));

          if (!id && req.method === "GET") return send(res, 200, list);

          if (!id && req.method === "POST") {
            const [place, error] = normalize(await readBody(req));
            if (error) return send(res, 400, { error });
            if (nameTaken(place.name)) return send(res, 409, { error: `“${place.name}” is already in the guide.` });
            list.push(place);
            await writePlaces(list);
            return send(res, 201, { ...place, id: slug(place.name) });
          }

          if (id && index === -1) return send(res, 404, { error: "That place no longer exists. Reload the list." });

          if (req.method === "PUT") {
            const [place, error] = normalize(await readBody(req));
            if (error) return send(res, 400, { error });
            if (nameTaken(place.name, index)) return send(res, 409, { error: `“${place.name}” is already in the guide.` });
            list[index] = place;
            await writePlaces(list);
            return send(res, 200, { ...place, id: slug(place.name) });
          }

          if (req.method === "DELETE") {
            const [removed] = list.splice(index, 1);
            await writePlaces(list);
            return send(res, 200, { deleted: removed.name });
          }

          return send(res, 405, { error: "Method not allowed" });
        } catch (e) {
          return send(res, 500, { error: e.message });
        }
      });
    },
  };
}
