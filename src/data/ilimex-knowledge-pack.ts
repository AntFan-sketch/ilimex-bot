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
  id: "mushroom-trial-results",
  title: "Mushroom Trial Results",
  text: `In the documented mushroom trial, the treated house showed an observed yield improvement of around 17% versus the control across three cycles.

The treated environment also showed improved day-to-day production stability relative to the control.

Public wording should describe this as an observed trial outcome rather than a guaranteed result for every site.

Preferred phrasing:
• observed yield improvement of around 17% across three cycles
• reported yield uplift of approximately 17% versus the control
• improved production consistency in the treated environment

Do not overstate the result.
Do not describe it as guaranteed.
Do not imply that every grower will achieve the same outcome.`,

},

{
  id: "mushroom-trial-environment",
  title: "Mushroom Trial Environment and Sequencing",
  text: `In the mushroom environmental dataset, the treated environment showed a shift in the airborne fungal profile relative to the control.

The sequencing profile indicated:
• lower Aspergillus
• lower Cladosporium
• higher Penicillium
• higher Wallemia

This should be described as an environmental sequencing observation.

Important interpretation rule:
NGS or environmental sequencing identifies the presence of genetic material in the sampled environment, but it does not by itself confirm whether detected organisms were viable.

Do not describe sequencing alone as proof of kill.
Do not describe sequencing alone as proof of viability reduction.
Do not imply that the observed fungal profile shift automatically caused the commercial outcome.`,

},

{
  id: "mushroom-commercial-guidance",
  title: "Mushroom Commercial Guidance",
  text: `For mushroom growers, Ilimex may be commercially relevant where the operator is focused on:
• crop consistency
• environmental control
• contamination pressure
• reducing operational variability
• maintaining more stable growing conditions

Commercial answers should remain careful and evidence-grounded.

Preferred commercial framing:
• may be relevant where environmental control is a priority
• may support more consistent production conditions
• may be commercially relevant where contamination pressure is a concern
• should be assessed site by site

Where appropriate, the next useful qualification questions are:
• How many growing rooms or tunnels are you operating?
• Are you mainly focused on contamination pressure, consistency, or yield performance?
• Are you looking at one room initially or a broader deployment?

Do not make guaranteed ROI claims or guaranteed yield claims.`,

},

{
  id: "mushroom-approved-wording",
  title: "Mushroom Approved Wording",
  text: `Approved public mushroom wording:

• In the documented mushroom trial, the treated house showed an observed yield improvement of around 17% versus the control across three cycles.
• The environmental sequencing data showed a shift in the airborne fungal profile in the treated environment relative to the control.
• In the sequencing dataset, the treated environment showed lower Aspergillus and Cladosporium and higher Penicillium and Wallemia relative to the control.
• NGS or environmental sequencing identifies the presence of genetic material in the sampled environment, but it does not by itself confirm whether detected organisms were viable.
• Keep biological findings and commercial outcomes separate unless the source text explicitly links them.
• Do not present the mushroom trial result as a guaranteed commercial outcome for every grower or every site.

Avoid wording such as:
• proved kill
• confirmed viability reduction
• guaranteed yield gains
• definitively caused the yield gain
• fully removes Aspergillus

Preferred replacements:
• observed in the trial dataset
• environmental sequencing indicated
• site-specific outcomes will vary
• should be assessed site by site`,

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
