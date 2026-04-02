import { externalMushroomEvals } from "./externalMushroomEvals";

export type EvalResult = {
  id: string;
  passed: boolean;
  failures: string[];
  answer: string;
  ctaOpened?: boolean;
};

const POULTRY_TERMS = [
  "broiler",
  "broilers",
  "poultry",
  "shed",
  "house 2",
  "house 5",
  "flock",
];

function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[‐-–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, items: string[]) {
  const t = normalise(text);
  return items.some((x) => t.includes(normalise(x)));
}

function includesAll(text: string, items: string[]) {
  const t = normalise(text);
  return items.every((x) => t.includes(normalise(x)));
}

export async function runExternalMushroomEvals(
  answerPrompt: (prompt: string) => Promise<{ answer: string; ctaOpened?: boolean }>
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const test of externalMushroomEvals) {
    const { answer, ctaOpened } = await answerPrompt(test.prompt);
    const failures: string[] = [];

    if (test.requiredAny && !includesAny(answer, test.requiredAny)) {
      failures.push(`Missing one of requiredAny: ${test.requiredAny.join(", ")}`);
    }

    if (test.requiredAll && !includesAll(answer, test.requiredAll)) {
      failures.push(`Missing requiredAll: ${test.requiredAll.join(", ")}`);
    }

    if (test.forbidden && includesAny(answer, test.forbidden)) {
      failures.push("Contains forbidden wording");
    }

    if (test.forbidPoultryTerms && includesAny(answer, POULTRY_TERMS)) {
      failures.push("Contains poultry contamination");
    }

    if (typeof test.shouldAllowCta === "boolean") {
      if (test.shouldAllowCta === false && ctaOpened) {
        failures.push("CTA opened on factual query");
      }

      if (test.shouldAllowCta === true && !ctaOpened) {
        failures.push("CTA did not open on commercial query");
      }
    }

    results.push({
      id: test.id,
      passed: failures.length === 0,
      failures,
      answer,
      ctaOpened,
    });
  }

  return results;
}