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

  const leadScore = input.leadScore ?? 0;
  let score = Math.round(leadScore * 0.55);

  const segment = `${input.segment ?? ""} ${input.sector ?? ""}`.toLowerCase();
  const partnership = (input.partnershipType ?? "").toLowerCase();
  const company = (input.company ?? "").toLowerCase();

  if (segment.includes("tier 1")) score += 18;
  if (segment.includes("integrator")) score += 18;
  if (segment.includes("producer")) score += 12;
  if (segment.includes("processor")) score += 10;
  if (segment.includes("poultry") || segment.includes("broiler")) score += 10;
  if (segment.includes("egg") || segment.includes("duck")) score += 6;

  if (segment.includes("genetics")) score += 14;
  if (segment.includes("equipment")) score += 12;
  if (segment.includes("distribution") || segment.includes("distributor")) score += 14;
  if (segment.includes("biosecurity") || segment.includes("veterinary")) score += 8;

  if (partnership.includes("distributor")) score += 16;
  if (partnership.includes("integrator")) score += 14;
  if (partnership.includes("equipment")) score += 12;
  if (partnership.includes("strategic")) score += 12;
  if (partnership.includes("trial")) score += 6;
  if (partnership.includes("direct")) score += 6;

  const strategicCompanies = [
    "pilgrim",
    "moy park",
    "avara",
    "noble",
    "hy-line",
    "2agriculture",
    "boparan",
    "aviagen",
    "crown chicken",
    "banham",
    "gressingham",
    "silver hill",
    "jf mckenna",
    "facco",
    "hendrix",
  ];

  if (strategicCompanies.some((name) => company.includes(name))) {
    score += 14;
  }

  const value = input.estimatedAnnualValue ?? 0;

  if (value >= 250000) score += 18;
  else if (value >= 100000) score += 14;
  else if (value >= 50000) score += 9;
  else if (value >= 20000) score += 5;

  const units = input.estimatedUnitCount ?? 0;

  if (units >= 20) score += 12;
  else if (units >= 10) score += 8;
  else if (units >= 5) score += 5;
  else if (units >= 2) score += 3;

  if (company.includes("test")) score = Math.min(score, 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}