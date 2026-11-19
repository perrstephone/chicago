import { places, CATEGORIES, REWARDS } from "./places.js";
import { MEALS } from "./categories.js";

const TZ = "America/Chicago";
const FOUNDED = 2022; // first edition of the wiki
const $ = (id) => document.getElementById(id);
// Place text comes from places.json, which can be hand-edited, so escape it before it goes into HTML.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const PICKERS = {
  stephanie: { name: "Stephanie", icon: "icon-star" },
  edwin: { name: "Edwin", icon: "icon-flame" },
};

const EMPTY_FILTERS = () => ({ categories: [], picks: [], budgets: [], meals: [], neighborhoods: [], cuisines: [], query: "" });
const state = EMPTY_FILTERS();
let visible = [];
let selected = null;

/* ——— Dateline ——— */

function chicagoNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const year = +parts.year, month = +parts.month, day = +parts.day;
  const dayOfYear = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 864e5);
  return { year, month, day, hour: +parts.hour, dayOfYear };
}

function roman(n) {
  const table = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, numeral] of table) while (n >= value) { out += numeral; n -= value; }
  return out;
}

function renderDateline() {
  const now = chicagoNow();
  $("dateline").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date());
  $("editionName").textContent = now.hour < 12 ? "Morning Edition" : now.hour < 17 ? "Afternoon Edition" : "Evening Edition";
  $("editionNumber").textContent = `Vol. ${roman(now.year - FOUNDED + 1)}, No. ${now.dayOfYear}`;
}

/* ——— Weather (Open-Meteo, no key needed) ——— */

const WEATHER = [
  [[0], "Clear skies"], [[1], "Mostly clear"], [[2], "Partly cloudy"], [[3], "Grey & overcast"],
  [[45, 48], "Foggy"], [[51, 53, 55, 56, 57], "Drizzly"], [[61, 63, 65, 66, 67], "Rainy"],
  [[71, 73, 75, 77], "Snowing"], [[80, 81, 82], "Passing showers"], [[85, 86], "Snow showers"],
  [[95, 96, 99], "Thunderstorms"],
];
const describeWeather = (code) => WEATHER.find(([codes]) => codes.includes(code))?.[1] ?? "Changeable";

async function renderWeather() {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=41.8781&longitude=-87.6298"
    + "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min"
    + "&temperature_unit=fahrenheit&timezone=America%2FChicago&forecast_days=1";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    const hi = Math.round(data.daily.temperature_2m_max[0]);
    const lo = Math.round(data.daily.temperature_2m_min[0]);
    $("weatherNow").textContent = `${temp}°F`;
    $("weatherDetail").textContent = `${describeWeather(code).toLowerCase()}, hi ${hi}° / lo ${lo}°`;
  } catch {
    $("weatherNow").textContent = "Weather:";
    $("weatherDetail").textContent = "forecast delayed at the press.";
  }
}

/* ——— Map ——— */

// Opening view: the Loop up through Lincoln Park and Wicker Park, where most listings live.
const CORE_BOUNDS = [[41.872, -87.69], [41.924, -87.612]];
const map = L.map("map", { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5 }).fitBounds(CORE_BOUNDS);
new ResizeObserver(() => map.invalidateSize()).observe($("map"));
L.control.zoom({ position: "topright" }).addTo(map);

const cartoKey = import.meta.env?.VITE_CARTO_KEY;
L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${cartoKey ? `?key=${cartoKey}` : ""}`, {
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}).addTo(map);

[
  [41.8826, -87.6233, "THE LOOP"], [41.8951, -87.6251, "STREETERVILLE"], [41.8907, -87.6377, "RIVER NORTH"],
  [41.8852, -87.6489, "WEST LOOP"], [41.9017, -87.6806, "WICKER PARK"], [41.9148, -87.6545, "LINCOLN PARK"],
  [41.9110, -87.6380, "OLD TOWN"], [41.8525, -87.6328, "CHINATOWN"], [41.9451, -87.6838, "ROSCOE VILLAGE"],
  [41.9961, -87.6601, "EDGEWATER"], [41.9045, -87.6290, "GOLD COAST"], [41.9205, -87.6800, "BUCKTOWN"],
  [41.8640, -87.6250, "SOUTH LOOP"], [41.7945, -87.5900, "HYDE PARK"], [41.8790, -87.6470, "GREEKTOWN"],
].forEach(([lat, lng, text]) => {
  L.marker([lat, lng], {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: "map-label", html: text, iconSize: [110, 18], iconAnchor: [55, 9] }),
  }).addTo(map);
});

const markerLayer = L.featureGroup().addTo(map);
const markers = new Map();

function iconFor(place, isSelected = false) {
  const classes = ["custom-marker", CATEGORIES[place.category].className];
  if (place.closed) classes.push("is-closed");
  if (isSelected) classes.push("is-selected");
  return L.divIcon({ className: "", html: `<div class="${classes.join(" ")}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
}

places.forEach((place) => {
  const marker = L.marker([place.lat, place.lng], {
    icon: iconFor(place), title: place.name + (place.closed ? " (permanently closed)" : ""), alt: place.name, riseOnHover: true,
  });
  marker.on("click", () => selectPlace(place));
  markers.set(place.id, marker);
});

function fitTo(list, animate = true) {
  if (!list.length) return;
  if (list.length === 1) { map.setView([list[0].lat, list[0].lng], 14, { animate }); return; }
  map.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 14, animate });
}
let fitTimer;
const scheduleFit = () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => fitTo(visible), 300); };

/* ——— Filtering ———
   Every group is multi-select. Within a group any selected option matches
   (e.g. West Loop OR River North). Picks are the exception: choosing both
   Stephanie and Edwin shows only the places we agree on. Empty = no filter. */

function matches(place, s = state) {
  if (s.categories.length && !s.categories.includes(place.category)) return false;
  if (!s.picks.every((who) => place.picks.includes(who))) return false;
  if (s.budgets.length && !s.budgets.includes(place.tier)) return false;
  if (s.neighborhoods.length && !s.neighborhoods.includes(place.neighborhood)) return false;
  if (s.cuisines.length && !place.cuisine.some((c) => s.cuisines.includes(c))) return false;
  if (s.meals.length && !(place.meal ?? []).some((m) => s.meals.includes(m))) return false;
  if (s.query) {
    const haystack = [place.name, place.type, place.neighborhood, ...place.alsoIn, ...place.cuisine, place.description]
      .join(" ").toLowerCase();
    if (!s.query.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}
const countWith = (patch) => places.filter((p) => matches(p, { ...state, ...patch })).length;
const filtersActive = () =>
  state.categories.length || state.picks.length || state.budgets.length || state.meals.length || state.neighborhoods.length || state.cuisines.length || state.query;
const toggleIn = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/* Budget tier 0–4 (Free, $, $$, $$$, $$$$). Food and bars already use $ tiers;
   dollar prices are bucketed per person: ≤$20, ≤$50, ≤$150, more. "Varies" counts as $. */
const TIERS = ["Free", "$", "$$", "$$$", "$$$$"];
function costTier(budget) {
  if (/^free/i.test(budget)) return 0;
  if (/^\$+$/.test(budget)) return Math.min(budget.length, 4);
  const n = parseFloat(budget.match(/\d+(\.\d+)?/)?.[0]);
  if (Number.isNaN(n)) return 1;
  return n <= 20 ? 1 : n <= 50 ? 2 : n <= 150 ? 3 : 4;
}
places.forEach((p) => { p.tier = costTier(p.budget); });
const byCost = (a, b) => (a.closed - b.closed) || (a.tier - b.tier) || a.name.localeCompare(b.name);

const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

/* Checkbox dropdowns for Neighborhood and Cuisine, built on <details>. */
const MULTIS = [
  { el: $("mealMulti"), key: "meals", none: "Any occasion", plural: "occasions", values: MEALS.filter((m) => places.some((p) => (p.meal ?? []).includes(m))) },
  { el: $("neighborhoodMulti"), key: "neighborhoods", none: "Anywhere", plural: "neighborhoods", values: uniqueSorted(places.map((p) => p.neighborhood)) },
  { el: $("cuisineMulti"), key: "cuisines", none: "Any cuisine", plural: "cuisines", values: uniqueSorted(places.flatMap((p) => p.cuisine)) },
];

MULTIS.forEach(({ el, key, values }) => {
  el.querySelector(".multi-options").innerHTML = values.map((v) =>
    `<label class="multi-option"><input type="checkbox" value="${esc(v)}"><span class="multi-name">${esc(v)}</span><span class="count"></span></label>`
  ).join("");
  el.addEventListener("change", (e) => {
    if (!e.target.matches("input[type=checkbox]")) return;
    state[key] = toggleIn(state[key], e.target.value);
    render({ fit: true });
  });
  el.querySelector(".multi-clear").addEventListener("click", () => {
    state[key] = [];
    render({ fit: true });
  });
});

// Only one dropdown open at a time; close on outside click.
document.addEventListener("click", (e) => {
  MULTIS.forEach(({ el }) => { if (el.open && !el.contains(e.target)) el.open = false; });
});
MULTIS.forEach(({ el }) => el.addEventListener("toggle", () => {
  if (el.open) MULTIS.forEach((m) => { if (m.el !== el) m.el.open = false; });
}));

function multiSummary(selected, none, plural) {
  if (!selected.length) return none;
  if (selected.length <= 2) return selected.join(", ");
  return `${selected.length} ${plural}`;
}

function syncControls() {
  // Sections
  document.querySelectorAll(".section-tab[data-category]").forEach((tab) => {
    const cat = tab.dataset.category;
    const on = cat === "All" ? !state.categories.length : state.categories.includes(cat);
    tab.setAttribute("aria-pressed", String(on));
    tab.querySelector(".count").textContent = cat === "All" ? countWith({ categories: [] }) : countWith({ categories: [cat] });
  });
  // Picks
  document.querySelectorAll('input[name="pick"]').forEach((box) => { box.checked = state.picks.includes(box.value); });
  document.querySelectorAll("[data-pick-count]").forEach((el) => {
    el.textContent = countWith({ picks: [el.dataset.pickCount] });
  });
  // Budget
  document.querySelectorAll('input[name="budget"]').forEach((box) => {
    const tier = Number(box.value);
    const n = countWith({ budgets: [tier] });
    box.checked = state.budgets.includes(tier);
    box.closest(".pick-chip").classList.toggle("is-empty", n === 0 && !box.checked);
    box.nextElementSibling.querySelector(".count").textContent = n;
  });
  // Dropdowns
  MULTIS.forEach(({ el, key, none, plural }) => {
    el.querySelectorAll(".multi-option").forEach((option) => {
      const box = option.querySelector("input");
      const n = countWith({ [key]: [box.value] });
      box.checked = state[key].includes(box.value);
      option.querySelector(".count").textContent = n;
      option.classList.toggle("is-empty", n === 0 && !box.checked);
    });
    el.querySelector(".multi-value").textContent = multiSummary(state[key], none, plural);
    el.classList.toggle("has-value", state[key].length > 0);
    el.querySelector(".multi-clear").disabled = !state[key].length;
  });
}

/* ——— Rendering ——— */

const stampsFor = (place, { compact = false } = {}) => place.picks.map((who) => {
  const { name, icon } = PICKERS[who];
  return compact
    ? `<span class="mini-stamp ${who}" title="${name}’s pick"><i class="${icon}" aria-hidden="true"></i><span class="sr-only">${name}’s pick</span></span>`
    : `<span class="stamp ${who}"><i class="${icon}" aria-hidden="true"></i>${name}’s pick</span>`;
}).join("");

function listingHTML(place) {
  const active = selected?.id === place.id;
  return `<li><button type="button" class="listing${place.closed ? " is-closed" : ""}${active ? " is-active" : ""}" data-id="${place.id}"${active ? ' aria-current="true"' : ""}>
    <span class="listing-top">
      <i class="dot ${CATEGORIES[place.category].className}" aria-hidden="true"></i>
      <span class="listing-name">${esc(place.name)}</span>
      <span class="leader" aria-hidden="true"></span>
      <span class="listing-cost">${place.closed ? "Closed" : esc(place.budget)}</span>
    </span>
    <span class="listing-meta">
      <span>${esc(place.type)} · ${esc(place.neighborhood)}${place.closed ? " · permanently closed" : ""}</span>
      <span class="listing-stamps">${stampsFor(place, { compact: true })}${REWARDS[place.rewards] && !place.closed
        ? `<span class="mini-stamp rewards" title="${esc(place.rewards)} rewards"><i class="icon-ticket" aria-hidden="true"></i><span class="sr-only">${esc(place.rewards)} rewards</span></span>`
        : ""}</span>
    </span>
  </button></li>`;
}

function renderList() {
  const list = $("resultList");
  if (!visible.length) {
    list.innerHTML = `<div class="empty"><p>Nothing in today’s paper matches all of that.</p><button type="button" data-action="clear">Loosen the filters</button></div>`;
    return;
  }
  list.innerHTML = Object.entries(CATEGORIES).map(([key, { label }]) => {
    const group = visible.filter((p) => p.category === key);
    if (!group.length) return "";
    return `<section class="group"><h3 class="group-head"><span>${label}</span></h3><ol>${group.map(listingHTML).join("")}</ol></section>`;
  }).join("");
}

function updateFiltersBadge() {
  const active = state.picks.length + state.budgets.length + state.meals.length + state.neighborhoods.length + state.cuisines.length + (state.query ? 1 : 0);
  const badge = $("filtersBadge");
  badge.hidden = !active;
  badge.textContent = active;
  badge.title = `${active} filter${active === 1 ? "" : "s"} on`;
}

/* Collapsible filter panel; the choice is remembered per browser. */
function setFiltersOpen(open) {
  $("filtersToggle").setAttribute("aria-expanded", String(open));
  $("filtersPanel").hidden = !open;
  try { localStorage.setItem("filtersOpen", open ? "1" : "0"); } catch {}
}
let savedOpen = null;
try { savedOpen = localStorage.getItem("filtersOpen"); } catch {}
setFiltersOpen(savedOpen ? savedOpen === "1" : !window.matchMedia("(max-width: 860px)").matches);
$("filtersToggle").addEventListener("click", () => {
  setFiltersOpen($("filtersToggle").getAttribute("aria-expanded") !== "true");
});

function render({ fit = false } = {}) {
  visible = places.filter((p) => matches(p)).sort(byCost);
  updateFiltersBadge();

  markerLayer.clearLayers();
  visible.forEach((p) => markers.get(p.id).addTo(markerLayer));

  const total = places.length;
  $("resultCount").textContent = visible.length === total
    ? `All ${total} listings`
    : `${visible.length} of ${total} listing${total === 1 ? "" : "s"}`;
  $("clearFilters").disabled = !filtersActive();

  syncControls();
  if (selected && !visible.includes(selected)) closeCard();
  renderList();
  if (fit) scheduleFit();
}

function factsFor(place) {
  const rows = [
    ["Neighborhood", esc(place.neighborhood)],
    ["Cost", esc(place.budget)],
    place.cuisine.length ? ["Cuisine", esc(place.cuisine.join(", "))] : ["Type", esc(place.type)],
    place.meal?.length && ["Good for", esc(place.meal.join(", "))],
    place.when && ["When", esc(place.when)],
    place.alsoIn.length && ["Also in", esc(place.alsoIn.join(", "))],
    REWARDS[place.rewards] && ["Rewards", `<button type="button" class="fact-link" data-classified="${esc(place.rewards)}">${esc(place.rewards)}${REWARDS[place.rewards].perk ? ` · ${esc(REWARDS[place.rewards].perk)}` : ""} <span aria-hidden="true">→</span></button>`],
  ].filter(Boolean);
  return rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
}

function selectPlace(place, { focusCard = true } = {}) {
  if (selected) markers.get(selected.id).setIcon(iconFor(selected));
  selected = place;
  markers.get(place.id).setIcon(iconFor(place, true));

  const card = $("placeCard");
  card.classList.toggle("is-closed", !!place.closed);
  $("placeCardBody").innerHTML = `
    ${place.closed ? `<p class="closed-banner">Permanently closed · kept here for old times’ sake</p>` : ""}
    <p class="clip-kicker">${CATEGORIES[place.category].label} · ${esc(place.type)}</p>
    <h2>${esc(place.name)}</h2>
    <p class="clip-byline">${esc(place.neighborhood)} · ${esc(place.budget)}</p>
    ${place.picks.length ? `<div class="stamps">${stampsFor(place)}</div>` : ""}
    <p class="story">${esc(place.description)}</p>
    <dl class="facts">${factsFor(place)}</dl>
    ${/^https?:\/\//i.test(place.url ?? "") && !place.closed ? `<a class="clip-link" href="${esc(place.url)}" target="_blank" rel="noopener">Visit website <span aria-hidden="true">↗</span></a>` : ""}`;
  card.hidden = false;
  card.querySelector(".clip-body").scrollTop = 0;
  if (focusCard) card.focus({ preventScroll: true });

  // Centre the pin in the part of the map the clipping isn't covering.
  const zoom = Math.max(map.getZoom(), 13);
  const isSheet = window.matchMedia("(max-width: 860px)").matches;
  const shiftX = isSheet ? 0 : (card.offsetWidth + 22) / 2;
  const target = map.project([place.lat, place.lng], zoom).subtract([shiftX, 0]);
  map.setView(map.unproject(target, zoom), zoom, { animate: true });
  renderList();
  document.querySelector(`.listing[data-id="${place.id}"]`)?.scrollIntoView({ block: "nearest" });
}

function closeCard() {
  if (selected) markers.get(selected.id).setIcon(iconFor(selected));
  const previous = selected;
  selected = null;
  $("placeCard").hidden = true;
  renderList();
  return previous;
}

function clearFilters() {
  Object.assign(state, EMPTY_FILTERS());
  $("placeSearch").value = "";
  render({ fit: true });
}

/* ——— Dispatch ——— */

function inSeason(place, { month, day }) {
  if (!place.season) return false;
  const [sm, sd, em, ed] = place.season;
  const today = month * 100 + day, start = sm * 100 + sd, end = em * 100 + ed;
  return start <= end ? today >= start && today <= end : today >= start || today <= end;
}

function renderDispatch() {
  const now = chicagoNow();
  const seasonal = places.filter((p) => !p.closed && inSeason(p, now));
  const favorites = places.filter((p) => !p.closed && p.picks.length === 2);
  const pool = seasonal.length ? seasonal : favorites;
  const place = pool[now.dayOfYear % pool.length];
  $("dispatchLabel").textContent = seasonal.length ? "In Season Now" : "Today’s Pick";
  $("dispatchText").innerHTML = `<b>${esc(place.name)}</b>: ${esc(place.summary)}`;
  $("dispatchText").dataset.id = place.id;
}

/* ——— Events ——— */

// Sections toggle on and off; "All Places" clears them.
document.querySelectorAll(".section-tab[data-category]").forEach((tab) => tab.addEventListener("click", () => {
  const cat = tab.dataset.category;
  state.categories = cat === "All" ? [] : toggleIn(state.categories, cat);
  if (state.categories.length === Object.keys(CATEGORIES).length) state.categories = [];
  render({ fit: true });
}));

document.querySelectorAll('input[name="budget"]').forEach((box) => box.addEventListener("change", () => {
  state.budgets = toggleIn(state.budgets, Number(box.value));
  render({ fit: true });
}));

document.querySelectorAll('input[name="pick"]').forEach((box) => box.addEventListener("change", () => {
  state.picks = toggleIn(state.picks, box.value);
  render({ fit: true });
}));

$("placeSearch").addEventListener("input", (e) => {
  state.query = e.target.value.toLowerCase().trim();
  render({ fit: true });
});

$("clearFilters").addEventListener("click", clearFilters);

$("resultList").addEventListener("click", (e) => {
  if (e.target.closest('[data-action="clear"]')) { clearFilters(); return; }
  const button = e.target.closest(".listing");
  if (button) selectPlace(places.find((p) => p.id === button.dataset.id));
});

$("closeCard").addEventListener("click", () => {
  const previous = closeCard();
  if (previous) document.querySelector(`.listing[data-id="${previous.id}"]`)?.focus();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || $("classifieds").open) return; // the dialog handles its own Escape
  const openMulti = MULTIS.find((m) => m.el.open);
  if (openMulti) { openMulti.el.open = false; openMulti.el.querySelector("summary").focus(); return; }
  if (selected) $("closeCard").click();
});

/* ——— Classifieds: the referral programs, with every place that honors them ——— */

function showOnMap(place) {
  if (!visible.includes(place)) clearFilters();
  selectPlace(place);
}

function renderClassifieds() {
  $("classifiedAds").innerHTML = Object.entries(REWARDS).map(([key, ad]) => {
    const honoredAt = places.filter((p) => p.rewards === key).sort((a, b) => a.closed - b.closed || a.name.localeCompare(b.name));
    return `<article class="ad" id="ad-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}" data-program="${esc(key)}">
      <p class="ad-kicker">${esc(ad.kicker)}</p>
      <h3 class="ad-headline">${esc(ad.headline)}</h3>
      ${ad.perk ? `<p class="ad-perk">${esc(ad.perk)}</p>` : ""}
      <p class="ad-body">${esc(ad.body)}</p>
      ${honoredAt.length ? `<div class="ad-honored">
        <p class="ad-label">Honored at these spots in the guide</p>
        <ul>${honoredAt.map((p) => `<li><button type="button" class="ad-place${p.closed ? " is-closed" : ""}" data-id="${p.id}">
          <i class="dot ${CATEGORIES[p.category].className}" aria-hidden="true"></i>
          <span class="ad-place-name">${esc(p.name)}</span>
          <span class="ad-place-meta">${esc(p.neighborhood)}${p.closed ? " · closed" : ""}</span>
          <span class="ad-place-go" aria-hidden="true">Map →</span>
        </button></li>`).join("")}</ul>
      </div>` : ""}
      <a class="ad-cta" href="${esc(ad.signup)}" target="_blank" rel="noopener">Sign up with our referral link <span aria-hidden="true">↗</span></a>
    </article>`;
  }).join("");
}

function openClassifieds(program) {
  renderClassifieds();
  const dialog = $("classifieds");
  if (!dialog.open) dialog.showModal();
  const ad = program && dialog.querySelector(`.ad[data-program="${CSS.escape(program)}"]`);
  dialog.querySelectorAll(".ad").forEach((el) => el.classList.toggle("is-highlighted", el === ad));
  if (ad) ad.scrollIntoView({ block: "nearest" });
  else dialog.querySelector(".classifieds-body").scrollTop = 0;
}

$("classifiedsBtn").addEventListener("click", () => openClassifieds());
$("closeClassifieds").addEventListener("click", () => $("classifieds").close());
$("classifieds").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) { e.currentTarget.close(); return; } // click on the backdrop
  const placeBtn = e.target.closest(".ad-place");
  if (placeBtn) {
    $("classifieds").close();
    showOnMap(places.find((p) => p.id === placeBtn.dataset.id));
  }
});
$("placeCardBody").addEventListener("click", (e) => {
  const link = e.target.closest("[data-classified]");
  if (link) openClassifieds(link.dataset.classified);
});

$("randomPlace").addEventListener("click", () => {
  const open = visible.filter((p) => !p.closed);
  const pool = open.length ? open : places.filter((p) => !p.closed);
  selectPlace(pool[Math.floor(Math.random() * pool.length)]);
});

$("dispatchText").addEventListener("click", (e) => {
  const place = places.find((p) => p.id === e.currentTarget.dataset.id);
  if (!place) return;
  if (!visible.includes(place)) clearFilters();
  selectPlace(place);
});

$("locateButton").addEventListener("click", () => {
  navigator.geolocation?.getCurrentPosition((pos) => {
    map.setView([pos.coords.latitude, pos.coords.longitude], 14, { animate: true });
  });
});

/* ——— Go to press ——— */

renderDateline();
renderDispatch();
renderWeather();
render();
window.addEventListener("load", () => { map.invalidateSize(); map.fitBounds(CORE_BOUNDS, { animate: false }); });

setInterval(() => { renderDateline(); renderDispatch(); }, 60 * 1000);
setInterval(renderWeather, 30 * 60 * 1000);
