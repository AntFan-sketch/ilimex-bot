// src/lib/crm/dealScore.ts

export type DealScoreInput = {
  lead_score?: number | null;
  segment?: string | null;
  sector?: string | null;
  partnership_type?: string | null;
  estimated_unit_count?: number | null;
  estimated_annual_value?: number | null;
  est_value?: number | null;
  deal_stage?: string | null;
  company_size?: string | null;
};

export function calculateDealScore(input: DealScoreInput): number {
  const stage = input.deal_stage?.toLowerCase() ?? "";

  if (stage === "closed won" || stage === "closed lost") {
    return 0;
  }

  let score = Math.max(input.lead_score ?? 0, 40);

  const segment = `${input.segment ?? ""} ${input.sector ?? ""}`.toLowerCase();
  const partnership = input.partnership_type?.toLowerCase() ?? "";

  if (segment.includes("poultry")) score += 12;
  if (segment.includes("integrator")) score += 15;
  if (segment.includes("producer")) score += 12;
  if (segment.includes("retailer")) score += 10;
  if (segment.includes("distributor")) score += 14;
  if (segment.includes("genetics")) score += 8;
  if (segment.includes("equipment")) score += 8;

  if (partnership.includes("distributor")) score += 14;
  if (partnership.includes("strategic")) score += 12;
  if (partnership.includes("trial")) score += 6;
  if (partnership.includes("direct sale")) score += 5;

  const value = Math.max(
    input.estimated_annual_value ?? 0,
    input.est_value ?? 0
  );

  if (value >= 250000) score += 20;
  else if (value >= 100000) score += 15;
  else if (value >= 50000) score += 10;
  else if (value >= 20000) score += 5;

  const units = input.estimated_unit_count ?? 0;

  if (units >= 20) score += 15;
  else if (units >= 10) score += 10;
  else if (units >= 5) score += 6;
  else if (units >= 2) score += 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}