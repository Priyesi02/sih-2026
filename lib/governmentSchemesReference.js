// lib/governmentSchemesReference.js
//
// A small, hand-verified reference list of REAL Indian government
// schemes relevant to artisans, used to ground generateListing.js's
// scheme suggestion the same way lib/pricingReference.js grounds
// pricing — give Gemini a fixed list of real options to choose from,
// don't let it freely invent scheme names/details from its own
// training data (which can be stale or outright hallucinated).
//
// WHY THIS MATTERS MORE THAN OTHER GROUNDED FIELDS: a wrong price
// estimate is a minor inconvenience. A wrong or invented government
// scheme name told to a low-literacy artisan could send them to the
// wrong office, waste their time, or make them distrust the app
// entirely. Treat this list as the single source of truth — if Gemini
// returns a scheme name that isn't in SCHEMES below, generateListing.js
// drops it rather than trusting it (see the validation logic there).
//
// Verified via web search (not from training-data memory alone) as of
// this project's build date. Government schemes get renamed, merged,
// or discontinued — re-verify these against official sources
// (pmvishwakarma.gov.in, msme.gov.in, handicrafts.gov.in,
// texmin.nic.in) before relying on this for anything beyond a hackathon
// demo, and update this file if anything has changed.

const SCHEMES = [
  {
    name: 'PM Vishwakarma Yojana',
    ministry: 'Ministry of Micro, Small and Medium Enterprises (MSME)',
    summary:
      'For artisans in 18 traditional trades (including potter, carpenter, blacksmith, goldsmith, cobbler, weaver, basket/mat maker, tailor, sculptor). Offers a ₹15,000 toolkit grant, free skill training with a daily stipend, and collateral-free loans up to ₹3 lakh at 5% interest. One member per family; not available to those who took a similar govt. self-employment loan (PMEGP/PM SVANidhi/Mudra) in the last 5 years.',
    relevantCategories: ['pottery', 'wood', 'metal', 'jewelry', 'bamboo', 'leather', 'embroidery', 'handloom textile'],
  },
  {
    name: 'National Handicrafts Development Programme (NHDP)',
    ministry: 'Ministry of Textiles',
    summary:
      'Supports handicraft artisans through skill training, marketing support, and cluster-based development. Individual participation typically requires a "Pahchan" (artisan identity) card.',
    relevantCategories: ['pottery', 'wood', 'metal', 'jewelry', 'bamboo', 'leather', 'embroidery', 'painting'],
  },
  {
    name: 'Comprehensive Handloom Cluster Development Scheme (CHCDS)',
    ministry: 'Ministry of Textiles',
    summary:
      'Specifically for handloom weavers — supports raw material access, technology upgradation, and market/export linkages for weaving clusters.',
    relevantCategories: ['handloom textile'],
  },
  {
    name: 'SFURTI (Scheme of Fund for Regeneration of Traditional Industries)',
    ministry: 'Ministry of MSME',
    summary:
      'Organizes traditional-industry artisans (khadi, coir, handloom, handicrafts) into clusters for shared infrastructure, technology upgrades, and market linkage. Usually applied for by a cluster organization/NGO/producer company on behalf of a group of artisans (500+ beneficiary families), not by one individual alone — worth raising with a local artisan collective or cooperative.',
    relevantCategories: ['pottery', 'wood', 'metal', 'jewelry', 'bamboo', 'leather', 'embroidery', 'handloom textile', 'painting'],
  },
];

/**
 * Renders the scheme list as plain text for the Gemini prompt.
 */
function formatSchemesForPrompt() {
  return SCHEMES.map(
    (s) => `- "${s.name}" (${s.ministry}): ${s.summary} [Most relevant for: ${s.relevantCategories.join(', ')}]`
  ).join('\n');
}

/**
 * Exact scheme names Gemini is allowed to return — used to reject any
 * hallucinated scheme name that isn't actually one of these four.
 */
function getSchemeNames() {
  return SCHEMES.map((s) => s.name);
}

module.exports = { formatSchemesForPrompt, getSchemeNames };
