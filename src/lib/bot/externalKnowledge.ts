// src/lib/bot/externalKnowledge.ts

export type ExternalKnowledgeChunk = {
  id: string;
  title: string;
  category: "positioning" | "trial" | "technology" | "conversion";
  keywords: string[];
  content: string;
};

export const EXTERNAL_KNOWLEDGE_CHUNKS: ExternalKnowledgeChunk[] = [
  {
    id: "positioning-core",
    title: "Core positioning",
    category: "positioning",
    keywords: ["ilimex", "flufence", "company", "what is ilimex", "overview"],
    content: `
Ilimex Ltd offers Ilimex Flufence, an air-treatment and biosecurity system designed to improve air hygiene inside poultry houses by reducing airborne pathogen load.

In commercial poultry trials, Ilimex has shown lower mortality, improved flock performance, and stronger economic return per flock.
`.trim(),
  },

  {
    id: "forster-trial-results",
    title: "A.J. Forster poultry trial results",
    category: "trial",
    keywords: [
      "forster",
      "aj forster",
      "a.j. forster",
      "trial",
      "trials",
      "poultry trial",
      "results",
      "mortality",
      "birds saved",
      "performance",
    ],
    content: `
A.J. Forster poultry trial (Crops 1 and 2):
- Controlled side-by-side commercial poultry trial
- Ilimex house: House 2
- Control house: House 5
- Approximately 21,560 birds per house

Validated facts:
- Approximately 0.5% mortality reduction across two crops
- Roughly 110 additional birds surviving per flock
- Crop 1 historical improvement: +10p per bird
- Crop 2 historical improvement: +5p per bird
- Approximately £330 per flock at £3 per bird
- Around £11,000 per poultry house per year based on 7 crops and average uplift
- The Ilimex house delivered the best and second-best crops ever recorded for that house
- The control house was historically one of the strongest-performing houses on the farm

Interpretation:
- Environmental conditions were closely matched between houses
- Results indicate repeatable mortality reduction and improved flock performance under commercial conditions
- In Crop 2, the Ilimex house started with younger and lower-quality chicks but still recovered strongly relative to expectations

Restrictions:
- Do not present outcomes as guaranteed on every farm
- Do not overstate causality beyond the trial evidence
`.trim(),
  },

  {
    id: "forster-trial-environment",
    title: "A.J. Forster trial setup and environmental validation",
    category: "trial",
    keywords: [
      "forster",
      "setup",
      "environment",
      "co2",
      "water",
      "ventilation",
      "pressure",
      "temperature",
      "hotraco",
      "monitoring",
    ],
    content: `
A.J. Forster trial setup:
- Hotraco Fortica environmental monitoring
- Parameters tracked: CO2, water intake, ventilation, pressure, temperature

Environmental validation:
- Environmental conditions were closely matched between houses
- This strengthens confidence that observed performance differences are associated with the Ilimex system rather than general environmental variation
`.trim(),
  },

  {
    id: "technology-how-it-works",
    title: "Technology overview",
    category: "technology",
    keywords: [
      "how does it work",
      "how it works",
      "technology",
      "filter",
      "uv",
      "uvc",
      "air treatment",
      "air sanitisation",
      "air purification",
    ],
    content: `
Ilimex Flufence technology overview:
- Air is drawn into the unit as part of the normal ventilation process
- Air passes through a filtration stage that captures particulate matter and biological material
- Air is exposed to UVC treatment to reduce airborne bacteria, viruses, and fungal spores
- Treated air is returned to the house to support a cleaner and more stable internal environment

Integration:
- Works alongside existing ventilation infrastructure
- Designed for retrofit or integration into new installations
- Adds an air-hygiene and biosecurity layer rather than replacing standard farm systems

Approved claims:
- Ilimex improves air quality within poultry houses
- The system reduces airborne pathogen load through filtration and UVC treatment
- Commercial trials show measurable improvements in flock outcomes

Restrictions:
- Do not claim elimination of all pathogens
- Do not present the system as a substitute for standard farm biosecurity
`.trim(),
  },

  {
    id: "commercial-roi",
    title: "Commercial ROI guidance",
    category: "conversion",
    keywords: [
      "roi",
      "return",
      "payback",
      "economics",
      "value",
      "worth",
      "revenue",
      "margin",
    ],
    content: `
Commercial ROI guidance:
- Based on trial data, value can come from mortality reduction and wider flock performance improvement
- Trial evidence suggests roughly £1,000–£1,600 per crop may be achievable depending on setup and baseline performance
- Forster trial signals include approximately £330 per flock at £3 per bird
- Historical performance improvements included +10p per bird in Crop 1 and +5p per bird in Crop 2
`.trim(),
  },

  {
    id: "commercial-pricing",
    title: "Pricing and quote guidance",
    category: "conversion",
    keywords: [
      "price",
      "pricing",
      "cost",
      "quote",
      "quotation",
      "how much",
      "install cost",
    ],
    content: `
Pricing guidance:
- Do not invent a fixed public price if one is not explicitly approved
- Explain that pricing depends on house size, ventilation setup, and number of units required
- A tailored estimate normally requires:
  - type of birds and number per house
  - dimensions of each shed
  - existing ventilation or air recirculation system
  - whether the customer wants a full installation or retrofit

CTA guidance:
- After answering, offer a tailored estimate or a conversation with the Ilimex team
`.trim(),
  },

  {
    id: "conversion-guidance",
    title: "Conversion and qualification guidance",
    category: "conversion",
    keywords: [
      "contact",
      "interested",
      "demo",
      "meeting",
      "call",
      "email",
      "estimate",
      "quote",
    ],
    content: `
Conversation guidance:
- Give a strong factual answer first
- Then ask at most one light qualification question if appropriate
- Good qualification questions include:
  - How many houses are you running?
  - How many birds do you typically run per house?
  - Are you seeing issues with mortality or consistency at the minute?
  - Are you planning upgrades this year?

CTA options:
- If you'd like, I can help arrange a quick conversation with the Ilimex team to look at your setup.
- Would you like a tailored estimate based on your house size and bird numbers?
`.trim(),
  },
];