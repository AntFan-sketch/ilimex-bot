// src/lib/toneMiddleware.ts

export type IlimexMode = "INTERNAL" | "EXTERNAL";

export type SensitivityLevel = "low" | "medium" | "high";

interface ToneOptions {
  sensitivity?: SensitivityLevel;
}

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  // Overstated certainty
  [/\b(proves?|proof of)\b/gi, "provides evidence consistent with"],
  [/\b(definitive(ly)?|conclusive(ly)?)\b/gi, "strong but still preliminary"],
  [/\b(guarantees?|ensures?|will\b(?! likely))/gi, "is expected to"],

  // Overstated effects
  [/\b(eliminates?|eradicates?)\b/gi, "substantially reduces in the trial context"],
  [/\b(completely|totally) removes\b/gi, "markedly reduces in the trial context"],
  [/\bdramatic(ally)?\b/gi, "notable"],
  [/\btransformative\b/gi, "potentially impactful"],

  // Overstated safety / regulatory
  [/\b(is|are) safe\b/gi, "appears safe within the conditions of the trial"],
  [/\b(fully )?compliant with all regulations\b/gi, "designed to support regulatory compliance (subject to formal approval)"],
];

const HIGH_SENSITIVITY_EXTRA: Array<[RegExp, string]> = [
  [/\b(very|highly|extremely) effective\b/gi, "effective within the limits of the current data"],
  [/\b(game[- ]?changing)\b/gi, "potentially valuable"],
];

const INTERNAL_FOOTER = `
—
Note: All findings described above are based on specific trial conditions, sample sizes, and timeframes. They should be treated as preliminary and context-dependent rather than as guaranteed performance in all farm environments. Further replicated trials and independent validation will be required before making definitive claims in external communications.
`.trim();

/**
 * Apply deterministic tone-softening to INTERNAL answers.
 * Does not change structure, headings, or citation markers (¹, ², ³…).
 */
export function softenInternalTone(
  text: string,
  { sensitivity = "medium" }: ToneOptions = {}
): string {
  let output = text;

  // Core replacements
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }

  // Extra softening for high sensitivity use-cases
  if (sensitivity === "high") {
    for (const [pattern, replacement] of HIGH_SENSITIVITY_EXTRA) {
      output = output.replace(pattern, replacement);
    }
  }

  // Avoid doubling the footer if run twice
  if (!output.includes("All findings described above are based on specific trial conditions")) {
    // If there is a "Sources:" block, put the footer just above it
    const sourcesIndex = output.indexOf("Sources:");
    if (sourcesIndex !== -1) {
      output =
        output.slice(0, sourcesIndex).trimEnd() +
        "\n\n" +
        INTERNAL_FOOTER +
        "\n\n" +
        output.slice(sourcesIndex);
    } else {
      output = output.trimEnd() + "\n\n" + INTERNAL_FOOTER;
    }
  }

  return output;
}
