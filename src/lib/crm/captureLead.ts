// src/lib/crm/captureLead.ts

import { upsertCrmLead } from "@/lib/crm/upsertLead";
import { redactSnippet, sha256 } from "@/lib/analytics/sanitize";

type CaptureLeadInput = {
  env: string;
  mode: "external" | "internal" | "manual";
  conversationId?: string;
  leadScore: number;
  intent?: string;
  segment?: string;
  scale?: unknown;
  timeline?: string;
  userText?: string;
  ipHash?: string;
  uaHash?: string;
};

export async function captureLead(input: CaptureLeadInput) {
  const {
    env,
    mode,
    conversationId,
    leadScore,
    intent,
    segment,
    scale,
    timeline,
    userText = "",
    ipHash,
    uaHash,
  } = input;

  const safeUserText = userText.trim();

  await upsertCrmLead({
    env,
    mode,
    conversationId,
    leadScore,
    intent,
    segment,
    scale: scale ? JSON.stringify(scale) : undefined,
    timeline,
    userTextHash: safeUserText ? sha256(safeUserText) : "",
    userSnippet: safeUserText ? redactSnippet(safeUserText, 160) : "",
    ipHash: ipHash ?? "",
    uaHash: uaHash ?? "",
  });
}