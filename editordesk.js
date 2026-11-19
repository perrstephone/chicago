import { CATEGORIES, REWARDS, MEALS, slug } from "./categories.js";

const $ = (id) => document.getElementById(id);
const form = $("placeForm");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let places = [];       // as stored in places.json, plus id
let currentId = null;  // null = new location
let cuisine = [];      // selected cuisine tags for the open form
let meal = [];         // selected meal occasions for the open form
let dirty = false;

/* ——— API (served by the dev server, see vite.config.js) ——— */

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Session expired or password change pending: send them back to the right screen.
    if (data.loginRequired) showGate("login");
    if (data.mustChange) showGate("change", { forced: true });
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

/* ——— Sign-in gate ——— */

let deskOpened = false;

function showGate(mode, { forced = false } = {}) {
  $("desk").hidden = true;
  $("authGate").hidden = false;
  $("loginForm").hidden = mode !== "login";
  $("changeForm").hidden = mode !== "change";
  $("loginError").textContent = "";
  $("changeError").textContent = "";
  if (mode === "login") {
    $("loginPassword").value = "";
    ($("loginUser").value ? $("loginPassword") : $("loginUser")).focus();
  } else {
    $("changeForm").reset();
    $("changeForm").dataset.forced = String(forced);
    $("changeKicker").textContent = forced ? "One more step" : "Your account";
    $("changeTitle").textContent = forced ? "Choose your own password" : "Change your password";
    $("changeHint").hidden = !forced;
    $("currentField").hidden = forced;
    $("currentPassword").required = !forced;
    $("changeCancel").textContent = forced ? "Log out" : "Cancel";
    (forced ? $("newPassword") : $("currentPassword")).focus();
  }
}

async function openDesk() {
  $("authGate").hidden = true;
  $("desk").hidden = false;
  pickMap.invalidateSize(); // the map was created while hidden
  if (!deskOpened) {
    deskOpened = true;
    await loadPlaces();
    fillForm(null);
  }
}

async function logout() {
  if (!okToLeave()) return;
  dirty = false;
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  deskOpened = false;
  showGate("login");
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!$("loginForm").reportValidity()) return;
  $("loginBtn").disabled = true;
  $("loginError").textContent = "";
  try {
    const { mustChange } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: $("loginUser").value, password: $("loginPassword").value }),
    });
    $("loginPassword").value = "";
    if (mustChange) showGate("change", { forced: true }); else await openDesk();
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginPassword").select();
  } finally {
    $("loginBtn").disabled = false;
  }
});

$("changeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const next = $("newPassword").value;
  $("confirmPassword").setCustomValidity(next === $("confirmPassword").value ? "" : "The two passwords don’t match.");
  if (!$("changeForm").reportValidity()) return;
  $("changeBtn").disabled = true;
  $("changeError").textContent = "";
  try {
    await api("/auth/change", { method: "POST", body: JSON.stringify({ current: $("currentPassword").value, next }) });
    $("changeForm").reset();
    await openDesk();
    setStatus("Password updated. Other signed-in windows have been logged out.", "is-saved");
  } catch (err) {
    $("changeError").textContent = err.message;
  } finally {
    $("changeBtn").disabled = false;
  }
});
$("confirmPassword").addEventListener("input", () => $("confirmPassword").setCustomValidity(""));

$("changeCancel").addEventListener("click", () => {
  if ($("changeForm").dataset.forced === "true") logout(); else openDesk();
});
$("changePasswordBtn").addEventListener("click", () => { if (okToLeave()) showGate("change", { forced: false }); });
$("logoutBtn").addEventListener("click", logout);

async function loadPlaces() {
  places = (await api("/places")).map((p) => ({ ...p, id: slug(p.name) }));
  renderList();
  renderDatalists();
}

/* ——— Sidebar list ——— */

function renderList() {
  const q = $("deskSearch").value.toLowerCase().trim();
  const shown = places.filter((p) => !q || `${p.name} ${p.neighborhood} ${p.type}`.toLowerCase().includes(q));
  $("deskCount").textContent = `${shown.length} of ${places.length} locations`;
  $("deskList").innerHTML = Object.entries(CATEGORIES).map(([key, { label, className }]) => {
    const group = shown.filter((p) => p.category === key).sort((a, b) => a.name.localeCompare(b.name));
    if (!group.length) return "";
    return `<section class="group"><h3 class="group-head"><span>${label}</span></h3><ul>${group.map((p) => `
      <li><button type="button" class="desk-item${p.id === currentId ? " is-active" : ""}${p.closed ? " is-closed" : ""}" data-id="${p.id}">
        <i class="dot ${className}" aria-hidden="true"></i>
        <span class="desk-item-name">${esc(p.name)}</span>
        <span class="desk-item-meta">${esc(p.neighborhood)}${p.closed ? " · closed" : ""}</span>
      </button></li>`).join("")}</ul></section>`;
  }).join("") || `<p class="hint">Nothing matches.</p>`;
}

function renderDatalists() {
  const hoods = [...new Set(places.flatMap((p) => [p.neighborhood, ...(p.alsoIn || [])]))].sort();
  $("neighborhoodList").innerHTML = hoods.map((h) => `<option value="${esc(h)}">`).join("");
}

/* ——— Cuisine tags ——— */

function renderMeal() {
  $("mealTags").innerHTML = MEALS.map((m) =>
    `<button type="button" class="tag" aria-pressed="${meal.includes(m)}" data-meal="${esc(m)}">${esc(m)}</button>`
  ).join("");
}

function renderCuisine() {
  const known = [...new Set([...places.flatMap((p) => p.cuisine || []), ...cuisine])].sort((a, b) => a.localeCompare(b));
  $("cuisineTags").innerHTML = known.map((tag) =>
    `<button type="button" class="tag" aria-pressed="${cuisine.includes(tag)}" data-tag="${esc(tag)}">${esc(tag)}</button>`
  ).join("");
}

function addCuisineTag() {
  const tag = $("cuisineNew").value.trim().replace(/\s+/g, " ");
  if (!tag) return;
  const existing = [...new Set(places.flatMap((p) => p.cuisine || []))].find((t) => t.toLowerCase() === tag.toLowerCase());
  const value = existing || tag;
  if (!cuisine.includes(value)) cuisine.push(value);
  $("cuisineNew").value = "";
  renderCuisine();
  markDirty();
}

/* ——— Pin-placing map ——— */

const pickMap = L.map("pickMap", { scrollWheelZoom: false }).setView([41.8935, -87.645], 12);
const cartoKey = import.meta.env?.VITE_CARTO_KEY;
L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${cartoKey ? `?key=${cartoKey}` : ""}`, {
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(pickMap);
let pin = null;

function setPin(lat, lng, { pan = true } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) { pin?.remove(); pin = null; return; }
  if (!pin) {
    pin = L.marker([lat, lng], { draggable: true, autoPan: true }).addTo(pickMap);
    pin.on("dragend", () => {
      const { lat, lng } = pin.getLatLng();
      writeCoords(lat, lng);
    });
  } else {
    pin.setLatLng([lat, lng]);
  }
  if (pan) pickMap.setView([lat, lng], Math.max(pickMap.getZoom(), 15));
}

function writeCoords(lat, lng) {
  $("f-lat").value = lat.toFixed(5);
  $("f-lng").value = lng.toFixed(5);
  markDirty();
}

pickMap.on("click", (e) => { writeCoords(e.latlng.lat, e.latlng.lng); setPin(e.latlng.lat, e.latlng.lng, { pan: false }); });
["f-lat", "f-lng"].forEach((id) => $(id).addEventListener("change", () => {
  setPin(parseFloat($("f-lat").value), parseFloat($("f-lng").value));
}));

async function geocode() {
  let q = $("f-address").value.trim();
  if (!q) { $("geocodeStatus").textContent = "Type a street address first."; return; }
  if (!/chicago|,\s*il\b|illinois/i.test(q)) q += ", Chicago, IL";
  $("geocodeStatus").textContent = "Looking it up…";
  try {
    const hit = await api(`/geocode?q=${encodeURIComponent(q)}`);
    writeCoords(hit.lat, hit.lng);
    setPin(hit.lat, hit.lng);
    $("geocodeStatus").textContent = `Found: ${hit.label}. Drag the pin if it’s a little off.`;
  } catch (e) {
    $("geocodeStatus").textContent = `${e.message} Try adding the cross street, or click the map instead.`;
  }
}

/* ——— Form ——— */

$("f-category").innerHTML = Object.entries(CATEGORIES).map(([k, { label }]) => `<option value="${k}">${label}</option>`).join("");
$("f-rewards").innerHTML = `<option value="">None</option>` + Object.keys(REWARDS).map((k) => `<option value="${k}">${k}</option>`).join("");

const pad = (n) => String(n).padStart(2, "0");
function parseMonthDay(s) {
  const m = s.trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const month = +m[1], day = +m[2];
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? [month, day] : null;
}

function syncSectionFields() {
  const category = $("f-category").value;
  $("cuisineField").hidden = !(category === "Food" || category === "Bars");
  $("mealField").hidden = !(category === "Food" || category === "Bars");
  $("seasonalFields").hidden = category !== "Seasonal";
}

function fillForm(p) {
  currentId = p?.id ?? null;
  form.reset();
  $("f-name").value = p?.name ?? "";
  $("f-category").value = p?.category ?? "Food";
  $("f-type").value = p?.type ?? "";
  $("f-neighborhood").value = p?.neighborhood ?? "";
  $("f-budget").value = p?.budget ?? "";
  $("f-lat").value = p?.lat ?? "";
  $("f-lng").value = p?.lng ?? "";
  $("f-summary").value = p?.summary ?? "";
  $("f-description").value = p?.description ?? "";
  $("f-closed").checked = !!p?.closed;
  $("f-url").value = p?.url ?? "";
  $("f-rewards").value = p?.rewards ?? "";
  $("f-alsoIn").value = (p?.alsoIn ?? []).join(", ");
  $("f-when").value = p?.when ?? "";
  $("f-seasonStart").value = p?.season ? `${pad(p.season[0])}-${pad(p.season[1])}` : "";
  $("f-seasonEnd").value = p?.season ? `${pad(p.season[2])}-${pad(p.season[3])}` : "";
  form.querySelectorAll('input[name="picks"]').forEach((box) => { box.checked = (p?.picks ?? []).includes(box.value); });
  cuisine = [...(p?.cuisine ?? [])];
  meal = [...(p?.meal ?? [])];
  $("geocodeStatus").textContent = "Or click the map / drag the pin to place it.";

  $("formKicker").textContent = p ? `Editing · ${CATEGORIES[p.category]?.label ?? p.category}` : "New location";
  $("formTitle").textContent = p?.name || "Untitled place";
  $("deleteBtn").hidden = !p;
  $("formStatus").textContent = "";
  $("formStatus").className = "form-status";

  syncSectionFields();
  renderCuisine();
  renderMeal();
  pickMap.invalidateSize();
  if (p) setPin(p.lat, p.lng); else { setPin(NaN, NaN); pickMap.setView([41.8935, -87.645], 12); }
  dirty = false;
  renderList();
}

function readForm() {
  const start = parseMonthDay($("f-seasonStart").value);
  const end = parseMonthDay($("f-seasonEnd").value);
  const category = $("f-category").value;
  return {
    name: $("f-name").value,
    category,
    type: $("f-type").value,
    neighborhood: $("f-neighborhood").value,
    alsoIn: $("f-alsoIn").value.split(",").map((s) => s.trim()).filter(Boolean),
    budget: $("f-budget").value,
    cuisine: category === "Food" || category === "Bars" ? cuisine : [],
    meal: category === "Food" || category === "Bars" ? MEALS.filter((m) => meal.includes(m)) : [],
    picks: [...form.querySelectorAll('input[name="picks"]:checked')].map((b) => b.value),
    closed: $("f-closed").checked,
    rewards: $("f-rewards").value,
    when: category === "Seasonal" ? $("f-when").value : "",
    season: category === "Seasonal" && start && end ? [...start, ...end] : null,
    lat: parseFloat($("f-lat").value),
    lng: parseFloat($("f-lng").value),
    url: $("f-url").value,
    summary: $("f-summary").value,
    description: $("f-description").value,
  };
}

function setStatus(text, kind = "") {
  $("formStatus").textContent = text;
  $("formStatus").className = `form-status ${kind}`;
}

function markDirty() {
  if (dirty) return;
  dirty = true;
  setStatus("Unsaved changes", "is-dirty");
}

const okToLeave = () => !dirty || confirm("You have unsaved changes. Discard them?");

/* ——— Events ——— */

form.addEventListener("input", (e) => {
  if (e.target.id === "f-name") $("formTitle").textContent = e.target.value || "Untitled place";
  if (e.target.id !== "cuisineNew" && e.target.id !== "f-address") markDirty();
});
form.addEventListener("change", (e) => {
  if (e.target.id === "f-category") syncSectionFields();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const seasonBad = !$("seasonalFields").hidden && ($("f-seasonStart").value || $("f-seasonEnd").value)
    && !(parseMonthDay($("f-seasonStart").value) && parseMonthDay($("f-seasonEnd").value));
  $("f-seasonStart").setCustomValidity(seasonBad ? "Use MM-DD for both dates, e.g. 11-20 and 12-24." : "");
  if (!form.reportValidity()) return;

  $("saveBtn").disabled = true;
  setStatus("Saving…");
  try {
    const saved = currentId
      ? await api(`/places/${currentId}`, { method: "PUT", body: JSON.stringify(readForm()) })
      : await api("/places", { method: "POST", body: JSON.stringify(readForm()) });
    await loadPlaces();
    fillForm(places.find((p) => p.id === saved.id));
    setStatus("Saved. The map has the change.", "is-saved");
  } catch (err) {
    setStatus(err.message, "is-error");
  } finally {
    $("saveBtn").disabled = false;
  }
});

$("resetBtn").addEventListener("click", () => {
  if (!dirty) return;
  if (confirm("Discard your unsaved changes?")) fillForm(places.find((p) => p.id === currentId));
});

$("deleteBtn").addEventListener("click", async () => {
  const place = places.find((p) => p.id === currentId);
  if (!place) return;
  if (!confirm(`Delete “${place.name}” from the guide?\n\nTo keep it on the map greyed out instead, tick “Permanently closed”.`)) return;
  try {
    await api(`/places/${currentId}`, { method: "DELETE" });
    await loadPlaces();
    fillForm(null);
    setStatus(`Deleted “${place.name}”.`, "is-saved");
  } catch (err) {
    setStatus(err.message, "is-error");
  }
});

$("newPlace").addEventListener("click", () => { if (okToLeave()) { fillForm(null); $("f-name").focus(); } });

$("deskList").addEventListener("click", (e) => {
  const item = e.target.closest(".desk-item");
  if (!item || item.dataset.id === currentId || !okToLeave()) return;
  fillForm(places.find((p) => p.id === item.dataset.id));
  document.querySelector(".form-card").scrollIntoView({ block: "start", behavior: "smooth" });
});

$("deskSearch").addEventListener("input", renderList);

$("mealTags").addEventListener("click", (e) => {
  const m = e.target.closest(".tag")?.dataset.meal;
  if (!m) return;
  meal = meal.includes(m) ? meal.filter((x) => x !== m) : [...meal, m];
  renderMeal();
  markDirty();
});

$("cuisineTags").addEventListener("click", (e) => {
  const tag = e.target.closest(".tag")?.dataset.tag;
  if (!tag) return;
  cuisine = cuisine.includes(tag) ? cuisine.filter((t) => t !== tag) : [...cuisine, tag];
  renderCuisine();
  markDirty();
});
$("cuisineAdd").addEventListener("click", addCuisineTag);
$("cuisineNew").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCuisineTag(); } });

$("geocodeBtn").addEventListener("click", geocode);
$("f-address").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); geocode(); } });

window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

/* ——— Start ——— */

try {
  const status = await api("/auth/status");
  if (!status.configured) {
    throw new Error("No admin password is set up. Add ADMIN_USER and ADMIN_PASSWORD to .env, then restart npm run dev.");
  }
  if (!status.authenticated) showGate("login");
  else if (status.mustChange) showGate("change", { forced: true });
  else await openDesk();
} catch (err) {
  const banner = $("deskBanner");
  banner.hidden = false;
  banner.innerHTML = `<b>The Editor’s Desk isn’t available.</b> It only works while <code>npm run dev</code> is running, opened from this computer at <a href="http://localhost:5173/editordesk">localhost:5173/editordesk</a>. <span class="hint-inline">(${esc(err.message)})</span>`;
}
