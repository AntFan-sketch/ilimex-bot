// src/lib/revenue/types.ts
export type Segment =
  | "mushroom"
  | "poultry"
  | "distributor"
  | "trial"
  | "investor"
  | "unknown";

export type Intent =
  | "information"
  | "technical"
  | "trial"
  | "commercial"
  | "high_intent"
  | "partnership"
  | "investor";

export type ScoreBand = "0_34" | "35_59" | "60_79" | "80_100";

export type RevenueMeta = {
  intent: Intent;
  segment: Segment;
  leadScore: number; // 0-100
  scoreBand: ScoreBand;
  signals: string[]; // debug-friendly, safe strings
  scale?: { unit: "houses" | "rooms"; count: number };
  timeline?: string;
  askQualification: boolean;
  qualificationQuestion?: string;
};