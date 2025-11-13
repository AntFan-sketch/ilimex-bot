import type { ChatMessage } from "@/types/chat";

/**
 * Very simple retrieval helper for IlimexBot.
 *
 * For now this is rule-based: it looks at the conversation and returns
 * relevant contextual text for the model. Later, you can replace this
 * with a true vector search (embeddings + vector DB) but keep the same
 * function signature so the API route does not change.
 */
export async function getContextForMessages(
  messages: ChatMessage[]
): Promise<string | null> {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  if (!lastUserMessage) {
    return null;
  }

  const text = lastUserMessage.content.toLowerCase();

  // Very basic keyword routing. Extend as needed.
  if (
    text.includes("mushroom") ||
    text.includes("house 18") ||
    text.includes("house18") ||
    text.includes("house 20") ||
    text.includes("house20")
  ) {
    return getMushroomTrialContext();
  }

  // Placeholder for future segments:
  if (text.includes("broiler") || text.includes("layer") || text.includes("poultry")) {
    return getPoultryPlaceholderContext();
  }

  if (text.includes("pig") || text.includes("swine")) {
    return getPigPlaceholderContext();
  }

  // Default: no extra context
  return null;
}

/**
 * Context chunk derived from docs/ilimex-bot-context.md
 * for the mushroom trial (House 18 vs House 20).
 *
 * Keep this aligned with the latest version of your docs.
 */
function getMushroomTrialContext(): string {
  return `
Mushroom Trial – House 18 vs House 20 (UK, 2025) – internal working summary:

We ran an early commercial trial on a mushroom site, comparing:
- House 18: equipped with an Ilimex Flufence air sterilisation system.
- House 20: a similar house on the same site without Ilimex.

The objective was to assess the impact of cleaner, sterilised air on yield, cycle time and operational stability under real commercial conditions. Key controllable factors such as substrate, growing regime and general farm management were kept as consistent as practical between houses.

Early observations indicate that the Ilimex house has a more stable growing environment and appears easier to manage day to day. There are indications of higher annual output and the potential for additional full production cycles per year compared with the baseline. Internal modelling has used scenarios where tens of thousands of pounds of extra revenue per house per year could be achieved at typical wholesale pricing, but these figures are illustrative only and not guarantees.

The working hypothesis is that reducing airborne pathogen and contaminant load creates a less stressful environment for the crop, supporting more consistent yield and quality and allowing the farm to make better use of its substrate and growing capacity.

These findings are based on a single site and a limited number of cycles. Microbiological and sequencing data are still being processed and further replication is needed. Any discussion of this trial must present results as early indications rather than promises, and emphasise that performance is site specific.
`;
}

/**
 * Placeholder poultry context. Replace with real detail as trials progress.
 */
function getPoultryPlaceholderContext(): string {
  return `
Poultry context – design intent and early position:

For poultry, including broilers, layers and breeders, Ilimex systems are designed to work alongside the existing ventilation rather than replace it. The aim is to reduce airborne pathogen load in the house air, helping to create a cleaner, more stable environment for the birds while the existing fans and environmental control continue to manage temperature, humidity and airflow.

For broilers, houses typically have higher stocking densities, strong ventilation and relatively short production cycles. Ilimex systems are intended to be positioned so treated air follows the main air paths in the house, whether the site uses tunnel ventilation, cross-flow or a mixed approach. Units are configured to run continuously or according to agreed duty cycles based on the site’s electrical and operational constraints.

For layers and breeders, housing and airflow patterns may differ, but the same principles apply: we work with the existing ventilation design, focus on treating air where birds are present, and adapt the number and placement of units based on house volume and air patterns.

As of now, detailed quantified poultry trial results are still to be added. All comments should be framed as general design intent and concept-level explanation rather than firm, quantified claims. Performance will be site-specific and must be confirmed by engineering review and real-world data as trials progress.
`;
}


/**
 * Placeholder pig context. Replace with real detail as trials progress.
 */
function getPigPlaceholderContext(): string {
  return `
Pig environment context – early position and design intent:

Pig housing environments often contain elevated levels of airborne pathogens, dust, aerosols and ammonia. These contribute to respiratory stress and can increase disease transmission risk. Ilimex systems are designed to support a cleaner and more stable environment by reducing airborne pathogen load without replacing the existing ventilation system.

Pig houses vary significantly depending on production stage, such as farrowing, weaner, grower and finisher units. Each has different stocking densities, airflow patterns and practical constraints. Ilimex designs for pigs focus on treating the air within the occupied space or along the main airflow paths while working with the site's existing fans and inlets.

Placement considerations typically include the main airflow direction, recirculation zones where air tends to stagnate, safe mounting heights and dust-load considerations. The goal is to integrate sterilised air into the natural or mechanical air movement of the house to support better environmental stability for the pigs.

At this stage, pig trials are still in planning or early preparation. No multi-cycle datasets are available yet. All comments must be framed as design intent rather than quantified performance claims. Results from other livestock or mushroom trials should not be assumed to apply directly to pigs. Performance will depend on site-specific conditions, management and engineering review at each location.
`;
}

