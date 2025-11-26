// src/data/ilimex-knowledge-pack.ts

export interface IlimexKnowledgeChunk {
  id: string;
  title: string;
  text: string;
}

export const ILIMEX_KNOWLEDGE_PACK: IlimexKnowledgeChunk[] = [
  {
    id: "company-boilerplate",
    title: "Company Boilerplate",
    text: `Ilimex is a Northern Ireland–based biosecurity technology company developing UVC-based air-sterilisation systems for agricultural environments.
Its flagship product, Flufence™, uses high-efficiency UVC irradiation to reduce airborne microbial load, improve environmental stability, and support more consistent production cycles.
Ilimex partners with farmers, producers, universities, and independent laboratories to conduct trials across poultry, mushrooms, and other agricultural sectors.`,
  },

  {
    id: "flufence-how-it-works-expanded",
    title: "Flufence – Expanded Mechanism",
    text: `Flufence™ is a UVC-based air-sterilisation system that operates by drawing air through a sealed UVC chamber.
Inside the chamber, airborne microbes are exposed to controlled UVC irradiation, reducing their viability before the air is returned to the growing or housing environment.

Key principles:
• UVC is fully contained inside the chamber; no UVC enters the room.
• No ozone or chemical residues are produced.
• The system is designed to run continuously alongside existing ventilation.
• Flufence complements environmental control; it does not replace good management or hygiene practices.`,
  },

  // ----------------------------
  // IMPORTANT: Poultry section replaced with a neutral placeholder
  // ----------------------------
{
  id: "poultry-trial-placeholder",
  title: "Poultry Trials – Placeholder (Awaiting Current Trial Results)",
  text: `Ilimex is actively running new poultry trials using Flufence™ in commercial broiler environments.
Because these trials are ongoing and data is still being collected and analysed, no performance-related or disease-related claims are included at this stage.

Safe framing for any discussion:
• Flufence is currently being evaluated in commercial poultry settings.
• Data is still being analysed.
• No performance or disease-related claims can be made yet.
• Results will depend on ventilation, management, building design, and health status.

This placeholder will be replaced with validated, leadership-approved content once sufficient data is available.`,
},

  // ----------------------------
  // Mushroom Trial (Expanded Internal + Public-safe combined)
  // ----------------------------
  {
    id: "mushroom-expanded-summary",
    title: "Mushroom Trial – House 18 vs House 20 (Expanded Summary)",
    text: `In a commercial mushroom trial, Flufence™ was installed in House 18, while House 20 served as a comparison house without Flufence.
Both houses operated under the grower's normal production regime.

Observed findings across multiple cycles:
• Yield stability: House 18 demonstrated more consistent yields across cycles, with less variability than House 20.
• Environmental consistency: Temperature and humidity profiles in House 18 were smoother, with fewer extreme fluctuations.
• Crop handling and predictability: Growers reported that House 18 was easier to maintain on target environmental conditions and tended to produce crops with more predictable performance from cycle to cycle.
• No negative impact on crop quality was linked to Flufence operation.

Interpretation:
These observations suggest that improving air cleanliness and stability may help reduce environmental variability that can stress mushroom crops.
A working hypothesis is that stabilising the air environment contributes to more consistent yield performance.

Important caveats:
• Results from one site may not represent all farms or environments.
• Many factors influence mushroom yield, including compost quality, casing, setpoints, and external weather.
• Sequencing and further analysis are ongoing; no pathogen-specific claims can be made at this stage.`,
  },

  // ----------------------------
  // Air Safety FAQ
  // ----------------------------
  {
    id: "faq-air-safety-expanded",
    title: "FAQ – Air Safety",
    text: `Flufence™ uses UVC light that is fully contained inside a sealed chamber. No UVC is emitted into the room or towards workers, birds, or crops.
The treated air leaving the unit is safe when the system is installed and operated as designed.
Flufence does not alter air chemically and does not generate ozone.`,
  },

  // ----------------------------
  // Ventilation FAQ
  // ----------------------------
  {
    id: "faq-ventilation-expanded",
    title: "FAQ – Ventilation",
    text: `Flufence™ does not replace ventilation systems in poultry, mushroom, or other agricultural buildings.
It complements existing ventilation by treating the air already circulating through the housing or growing environment.
Ventilation, environmental control, and management practices remain essential for performance and welfare.`,
  },

  // ----------------------------
  // Yield Guarantees FAQ
  // ----------------------------
  {
    id: "faq-yield-claims",
    title: "FAQ – Yield & Guarantees",
    text: `Flufence™ cannot guarantee increased yield or specific performance outcomes.
Trials in different environments suggest that improving air stability and consistency may help support more predictable production, but results vary by site and depend on factors such as ventilation, building design, crop or flock health, and overall management.
No yield or pathogen-specific guarantees should ever be stated.`,
  },
];
