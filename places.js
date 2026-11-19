// Every place on the map lives in places.json. Edit it with the Editor's Desk
// (npm run dev, then open /editordesk) or by hand.
//
// Fields
//   name, category, type, neighborhood, budget, lat, lng, summary, description  (required)
//   picks:   ["stephanie", "edwin"]: ⭐ / 🔥 in the wiki
//   cuisine: food & bar tags; drives the Cuisine filter
//   meal:    occasions from MEALS in categories.js (Quick bite, Fancy night out…); drives the Meal filter
//   alsoIn:  other neighborhoods with a location
//   closed:  true greys the place out but keeps it on the map
//   rewards: a key of REWARDS in categories.js
//   when / season: seasonal timeframe text, and [startMonth, startDay, endMonth, endDay]

import data from "./places.json";
import { slug } from "./categories.js";

export { CATEGORIES, REWARDS } from "./categories.js";

export const places = data.map((p) => ({ alsoIn: [], cuisine: [], meal: [], picks: [], ...p, id: slug(p.name) }));
