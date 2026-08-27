import { externalPublicEvals } from "./externalPublicEvals";

export type ExternalPublicEvalResult = {
  id: string;
  passed: boolean;
  failures: string[];
  answer: string;
};

function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[‐-–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, items: string[]) {
  const t = normalise(text);
  return items.some((item) => t.includes(normalise(item)));
}

function includesAll(text: string, items: string[]) {
  const t = normalise(text);
  return items.every((item) => t.includes(normalise(item)));
}

export async function runExternalPublicEvals(
  answerPrompt: (prompt: string) => Promise<string>
): Promise<ExternalPublicEvalResult[]> {
  const results: ExternalPublicEvalResult[] = [];

  for (const test of externalPublicEvals) {
    const answer = await answerPrompt(test.prompt);
    const failures: string[] = [];

    if (test.requiredAny && !includesAny(answer, test.requiredAny)) {
      failures.push(`Missing one of requiredAny: ${test.requiredAny.join(", ")}`);
    }

    if (test.requiredAll && !includesAll(answer, test.requiredAll)) {
      failures.push(`Missing requiredAll: ${test.requiredAll.join(", ")}`);
    }

    if (test.forbidden && includesAny(answer, test.forbidden)) {
      failures.push(`Contains forbidden wording: ${test.forbidden.join(", ")}`);
    }

    results.push({
      id: test.id,
      passed: failures.length === 0,
      failures,
      answer,
    });
  }

  return results;
}
