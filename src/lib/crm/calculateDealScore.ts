// src/lib/crm/calculateDealScore.ts

export type DealScoreInput = {
  leadScore?: number | null;
  segment?: string | null;
  sector?: string | null;
  partnershipType?: string | null;
  estimatedUnitCount?: number | null;
  estimatedAnnualValue?: number | null;
  company?: string | null;
  dealStage?: string | null;
};

export function calculateDealScore(input: DealScoreInput): number {
  const stage = (input.dealStage ?? "").toLowerCase();

  if (stage === "closed won" || stage === "closed lost") return 0;

  let score = Math.max(input.leadScore ?? 0, 40);

  const segment = `${input.segment ?? ""} ${input.sector ?? ""}`.toLowerCase();
  const partnership = (input.partnershipType ?? "").toLowerCase();
  const company = (input.company ?? "").toLowerCase();

  if (segment.includes("poultry")) score += 12;
  if (segment.includes("distributor")) score += 14;
  if (segment.includes("integrator")) score += 16;
  if (segment.includes("producer")) score += 12;
  if (segment.includes("retailer")) score += 12;
  if (segment.includes("genetics")) score += 10;
  if (segment.includes("equipment")) score += 8;

  if (partnership.includes("distributor")) score += 14;
  if (partnership.includes("strategic")) score += 12;
  if (partnership.includes("trial")) score += 5;
  if (partnership.includes("direct")) score += 5;

  const value = input.estimatedAnnualValue ?? 0;

  if (value >= 250000) score += 20;
  else if (value >= 100000) score += 15;
  else if (value >= 50000) score += 10;
  else if (value >= 20000) score += 5;

  const units = input.estimatedUnitCount ?? 0;

  if (units >= 20) score += 15;
  else if (units >= 10) score += 10;
  else if (units >= 5) score += 6;
  else if (units >= 2) score += 3;

  if (
    company.includes("pilgrim") ||
    company.includes("moy park") ||
    company.includes("avara") ||
    company.includes("noble") ||
    company.includes("hy-line") ||
    company.includes("2agriculture") ||
    company.includes("boparan")
  ) {
    score += 15;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}