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

  source?: string;
  contactName?: string;
  company?: string;
  farm?: string;
  email?: string;
  phone?: string;
  notes?: string;
  status?: "new" | "contacted" | "qualified" | "closed";
  isTest?: boolean;

  linkedinUrl?: string;
  website?: string;
  sector?: string;
  annualBirdCount?: number | null;
  partnershipType?: string;
  estimatedUnitCount?: number | null;
  estimatedAnnualValue?: number | null;

  chatSummary?: string;
  lastUserMessage?: string;
  lastBotMessage?: string;

  role?: string;

  ipHash?: string;
  uaHash?: string;
};

function clean(value?: string) {
  const v = String(value ?? "").trim();
  return v || undefined;
}

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
    source,
    contactName,
    company,
    farm,
    email,
    phone,
    notes,
    status,
    isTest,
    linkedinUrl,
    website,
    sector,
    annualBirdCount,
    partnershipType,
    estimatedUnitCount,
    estimatedAnnualValue,
    chatSummary,
    lastUserMessage,
    lastBotMessage,
    role,
    ipHash,
    uaHash,
  } = input;

  const safeUserText = userText.trim();
  const safeNotes = clean(notes);

  return await upsertCrmLead({
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
    source: clean(source),
    contactName: clean(contactName),
    company: clean(company),
    farm: clean(farm),
    email: clean(email),
    phone: clean(phone),
    notes: safeNotes,
    status: status ?? "new",
    isTest: isTest ?? false,
    linkedinUrl: clean(linkedinUrl),
    website: clean(website),
    sector: clean(sector),
    annualBirdCount: annualBirdCount ?? null,
    partnershipType: clean(partnershipType),
    estimatedUnitCount: estimatedUnitCount ?? null,
    estimatedAnnualValue: estimatedAnnualValue ?? null,
    chatSummary: clean(chatSummary),
    lastUserMessage: clean(lastUserMessage),
    lastBotMessage: clean(lastBotMessage),
    role: clean(role),
    ipHash: ipHash ?? "",
    uaHash: uaHash ?? "",
  });
}