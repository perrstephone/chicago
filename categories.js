// Shared by the map (app.js) and the Editor's Desk (editordesk.js).

export const CATEGORIES = {
  "Food":       { label: "Food",             className: "food" },
  "Bars":       { label: "Bars & Cocktails", className: "bar" },
  "Activities": { label: "Activities",       className: "activity" },
  "Seasonal":   { label: "Seasonal",         className: "seasonal" },
};

// Rewards / referral programs (misc/referral-programs.md). A place's `rewards` field is one of these keys,
// and the Classifieds section on the map lists every place that honors each program.
export const REWARDS = {
  "One Off Hospitality": {
    kicker: "Restaurant group rewards",
    headline: "Eat your way through One Off Hospitality",
    body: "One Off Hospitality runs a variety of restaurants and bakeries in Chicago. They notably own Avec and Publican, and they used to own Violet Hour until its demise. Join their guest program with our referral link.",
    perk: null,
    signup: "https://oneoffhospitality.myguestaccount.com/guest/enroll?card-template=JTIldXJsLXBhcmFtLWFlcy1rZXklcFVvZEh2OStRNG4zcUZYSiVGckJ1cjdnbzFJVXBOZDU5NUFNSkl2OD0%3D&template=0&referral_code=pkGBriJCPaCNCMeMCkqefrnhQnknNEdJa",
  },
  "InKind": {
    kicker: "Cash back on dining",
    headline: "$25 off your first check with InKind",
    body: "InKind is a rewards program that offers up to 25% cash back at select restaurants, both in and out of Chicago! Our referral link gives you $25 to spend on your first check.",
    perk: "$25 first check · up to 25% back",
    signup: "https://app.inkind.com/refer/OSQTNV9Y",
  },
};

export const PICKERS = ["stephanie", "edwin"];

// Meal occasions, in the order the wiki's food pages use them (breakfast-cafes.md, lunch-dinner.md, bars.md).
export const MEALS = ["Coffee & pastry", "Brunch", "Quick bite", "Casual sit-down", "Dressy casual", "Fancy night out", "Drinks"];

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
