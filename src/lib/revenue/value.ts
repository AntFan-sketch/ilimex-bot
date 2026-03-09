export function estimateLeadValue(
  segment?: string | null,
  scale?: { unit: string; count: number } | null
): number | null {
  if (!segment || !scale) return null;

  const count = scale.count ?? 0;

  if (segment === "poultry") {
    return count * 22000;
  }

  if (segment === "mushroom") {
    return count * 18000;
  }

  return null;
}