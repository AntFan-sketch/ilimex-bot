// src/lib/revenue/scoreManualLead.ts

import { scoreLead } from "@/lib/revenue/scoring";

type ManualLeadScoreInput = {
  notes?: string;
  company?: string;
  farm?: string;
  source?: string;
  segment?: string;
  timeline?: string;
  houses?: number | null;
  birdCount?: number | null;
};

function normalizeSegment(segment?: string): string | undefined {
  const v = String(segment ?? "").trim().toLowerCase();
  return v || undefined;
}

function normalizeTimeline(timeline?: string): string | undefined {
  const v = String(timeline ?? "").trim().toLowerCase();
  return v || undefined;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildScoringText(input: ManualLeadScoreInput): string {
  const parts: string[] = [];

  if (input.company) parts.push(`Company: ${input.company}`);
  if (input.farm) parts.push(`Farm: ${input.farm}`);
  if (input.source) parts.push(`Source: ${input.source}`);
  if (input.segment) parts.push(`Segment: ${input.segment}`);
  if (input.timeline) parts.push(`Timeline: ${input.timeline}`);
  if (typeof input.houses === "number" && input.houses > 0) {
    parts.push(`${input.houses} houses`);
  }
  if (typeof input.birdCount === "number" && input.birdCount > 0) {
    parts.push(`${input.birdCount} birds`);
  }
  if (input.notes) parts.push(input.notes);

  return parts.join(". ");
}

export function scoreManualLead(input: ManualLeadScoreInput) {
  const message = buildScoringText(input);

  const scored = scoreLead({
    message,
    leadSubmitted: false,
    messageCount: 1,
    qualificationAsked: true,
  });

  const explicitSegment = normalizeSegment(input.segment);
  const explicitTimeline = normalizeTimeline(input.timeline);

  let segment = scored.segment;
  let timeline = scored.timeline;
  let scale = scored.scale;
  let leadScore = scored.leadScore;
  const signals = [...scored.signals];

  if (explicitSegment && explicitSegment !== "unknown" && segment !== explicitSegment) {
    segment = explicitSegment as typeof scored.segment;
    signals.push(`manual_segment:${explicitSegment}`);
    leadScore += 4;
  }

  if (explicitTimeline && timeline !== explicitTimeline) {
    timeline = explicitTimeline;
    signals.push(`manual_timeline:${explicitTimeline}`);
    leadScore += 3;
  }

  if (!scale && typeof input.houses === "number" && input.houses > 0) {
    const unit = explicitSegment === "mushroom" ? "rooms" : "houses";

    scale = { unit, count: input.houses };
    signals.push(`manual_scale:${unit}:${input.houses}`);

    if (input.houses >= 50) leadScore += 18;
    else if (input.houses >= 25) leadScore += 14;
    else if (input.houses >= 10) leadScore += 10;
    else if (input.houses >= 5) leadScore += 6;
    else leadScore += 3;
  }

  if (explicitSegment === "poultry" && typeof input.birdCount === "number" && input.birdCount > 0) {
    signals.push(`manual_bird_count:${input.birdCount}`);

    if (input.birdCount >= 100000) leadScore += 14;
    else if (input.birdCount >= 40000) leadScore += 10;
    else if (input.birdCount >= 20000) leadScore += 7;
    else if (input.birdCount >= 10000) leadScore += 5;
    else leadScore += 2;
  }

  return {
    ...scored,
    leadScore: clampScore(leadScore),
    segment,
    timeline,
    scale,
    signals,
    scoringText: message,
  };
}