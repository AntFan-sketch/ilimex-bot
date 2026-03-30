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
Ilimex Ltd offers Ilimex Flufence, an air-treatment and biosecurity system designed to support air hygiene and environmental control in agricultural environments.

We are working across poultry and mushrooms, with public answers required to stay within the documented evidence for each sector.
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
      "profit",
      "margin",
      "per bird",
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
- Internal commercial analysis indicated this represented a meaningful uplift in value per flock
- Do not reference +5p / +10p per bird in public-facing responses unless explicitly required
- Trials so far indicate an improved profit margin per bird of approximately 10–20%
- The Ilimex house delivered the best and second-best crops ever recorded for that house
- The control house was historically one of the strongest-performing houses on the farm

Interpretation:
- Environmental conditions were closely matched between houses
- Results indicate repeatable mortality reduction and improved flock performance under commercial conditions
- In Crop 2, the Ilimex house started with younger and lower-quality chicks but still recovered strongly relative to expectations

Restrictions:
- Do not say the annual profit uplift comes from mortality alone
- Do not present the 10–20% improvement as guaranteed on every farm
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
- Air is drawn into the unit as part of the normal ventilation or air-handling process
- Air passes through a treatment chamber designed to support air hygiene
- The system is designed to work alongside existing environmental control infrastructure
- It adds an air-hygiene and biosecurity layer rather than replacing standard site management

Restrictions:
- Do not claim elimination of all pathogens
- Do not present the system as a substitute for standard site biosecurity or environmental management
- Do not make sector-specific performance claims unless they are explicitly supported elsewhere in the retrieved knowledge
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
      "profit",
      "per bird",
    ],
    content: `
Commercial ROI guidance:
- Based on poultry trial data so far, Ilimex has shown two main economic signals:
  - approximately 0.5% mortality reduction
  - improved profit margin per bird of approximately 10–20%
- It is better to describe the poultry commercial benefit as improved profit margin per bird and let the farmer apply that to their own flock economics
- For public-facing poultry answers, prefer percentage-based commercial impact rather than trial-specific pence-per-bird figures

Restrictions:
- Do not imply that the profit uplift is driven by mortality alone
- Do not reference +5p or +10p per bird in public-facing answers unless the user explicitly asks for underlying trial detail
- Do not invent a universal payback figure if one is not explicitly supported
- Do not use poultry commercial figures to answer mushroom questions
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
- Explain that pricing depends on site size, setup, and number of units required
- A tailored estimate normally requires relevant site information and review by the Ilimex team

CTA guidance:
- After answering, offer a tailored estimate or a conversation with the Ilimex team where appropriate
`.trim(),
  },

  {
    id: "external-claims-wording",
    title: "Approved external wording for poultry trial claims",
    category: "conversion",
    keywords: [
      "profit",
      "margin",
      "mortality",
      "results",
      "claims",
      "trial",
      "commercial",
      "economic",
      "wording",
      "performance",
    ],
    content: `
Approved external poultry wording:
- The poultry trials so far have shown two key positive signals:
  - approximately 0.5% mortality reduction
  - approximately 10–20% improved profit margin per bird
- These should normally be described as separate observed outcomes from the trial
- Avoid saying that mortality reduction is what created the full profit margin improvement unless explicitly supported
- A good external phrasing is:
  "The trials so far have shown approximately 0.5% lower mortality and an improved profit margin per bird of around 10–20%."
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

CTA options:
- If you'd like, I can help arrange a quick conversation with the Ilimex team to look at your setup.
- Would you like a tailored estimate based on your site setup?
`.trim(),
  },

  {
    id: "mushroom-trial-results",
    title: "Mushroom trial results",
    category: "trial",
    keywords: [
      "mushroom",
      "mushrooms",
      "mushroom trial",
      "results",
      "yield",
      "uplift",
      "improvement",
      "house 18",
      "house 20",
      "cycles",
      "production stability",
      "consistency",
    ],
    content: `
In the documented mushroom trial, the treated house showed an observed yield improvement of around 17% versus the control across three cycles.

The treated environment also showed improved day-to-day production stability relative to the control.

Public wording should describe this as an observed trial result rather than a guaranteed result for every site.

Preferred phrasing:
- observed yield improvement of around 17% across three cycles
- reported yield uplift of approximately 17% versus the control
- improved production consistency in the treated environment

Restrictions:
- Do not overstate the result
- Do not describe it as guaranteed
- Do not imply that every grower will achieve the same outcome
`.trim(),
  },

  {
    id: "mushroom-trial-environment",
    title: "Mushroom trial environment and sequencing",
    category: "trial",
    keywords: [
      "mushroom",
      "sequencing",
      "ngs",
      "aspergillus",
      "cladosporium",
      "penicillium",
      "wallemia",
      "fungi",
      "fungal",
      "mould",
      "mold",
      "viability",
      "environment",
      "airborne fungal profile",
    ],
    content: `
In the mushroom environmental dataset, the treated environment showed a shift in the airborne fungal profile relative to the control.

The sequencing profile indicated:
- lower Aspergillus
- lower Cladosporium
- higher Penicillium
- higher Wallemia

This should be described as an environmental sequencing observation.

Important interpretation rule:
NGS or environmental sequencing identifies the presence of genetic material in the sampled environment, but it does not by itself confirm whether detected organisms were viable.

Restrictions:
- Do not describe sequencing alone as proof of kill
- Do not describe sequencing alone as proof of viability reduction
- Do not imply that the observed fungal profile shift automatically caused the commercial outcome
- Prefer wording such as "the sequencing profile showed lower Aspergillus relative to the control"
`.trim(),
  },

  {
    id: "mushroom-commercial-guidance",
    title: "Mushroom commercial guidance",
    category: "conversion",
    keywords: [
      "mushroom",
      "commercial",
      "fit",
      "relevant",
      "tunnel",
      "tunnels",
      "room",
      "rooms",
      "growing room",
      "deployment",
      "contamination pressure",
      "consistency",
      "environmental control",
      "worth discussing",
    ],
    content: `
For mushroom growers, Ilimex may be commercially relevant where the operator is focused on:
- crop consistency
- environmental control
- contamination pressure
- reducing operational variability
- maintaining more stable growing conditions

Preferred commercial framing:
- may be relevant where environmental control is a priority
- may support more consistent production conditions
- may be commercially relevant where contamination pressure is a concern
- should be assessed site by site

Useful qualification questions where appropriate:
- How many growing rooms or tunnels are you operating?
- Are you mainly focused on contamination pressure, consistency, or yield performance?
- Are you looking at one room initially or a broader deployment?

Restrictions:
- Do not make guaranteed ROI claims
- Do not make guaranteed yield claims
`.trim(),
  },

  {
    id: "mushroom-approved-wording",
    title: "Approved mushroom wording",
    category: "conversion",
    keywords: [
      "mushroom",
      "wording",
      "claims",
      "ngs",
      "sequencing",
      "aspergillus",
      "yield",
      "results",
      "viability",
      "commercial",
    ],
    content: `
Approved public mushroom wording:
- In the documented mushroom trial, the treated house showed an observed yield improvement of around 17% versus the control across three cycles.
- The environmental sequencing data showed a shift in the airborne fungal profile in the treated environment relative to the control.
- In the sequencing dataset, the treated environment showed lower Aspergillus and Cladosporium and higher Penicillium and Wallemia relative to the control.
- NGS or environmental sequencing identifies the presence of genetic material in the sampled environment, but it does not by itself confirm whether detected organisms were viable.
- Keep biological findings and commercial outcomes separate unless the source text explicitly links them.
- Do not present the mushroom trial result as a guaranteed commercial outcome for every grower or every site.

Avoid wording such as:
- proved kill
- confirmed viability reduction
- reduced airborne pathogens
- reduced Aspergillus
- guaranteed yield gains
- definitively caused the yield gain

Preferred replacements:
- observed in the trial dataset
- environmental sequencing indicated
- the sequencing profile showed lower Aspergillus relative to the control
- site-specific outcomes will vary
- should be assessed site by site
`.trim(),
  },
];