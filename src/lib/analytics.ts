// src/lib/analytics.ts

import fs from "fs";
import path from "path";
import type { IlimexBotLogEntry } from "./logger";

const LOG_FILE = path.join(
  process.cwd(),
  "logs",
  "ilimex-bot.log.jsonl",
);

export interface IlimexAnalyticsSummary {
  totalInteractions: number;
  publicCount: number;
  internalCount: number;
  avgLatencyMs: number | null;
  firstTimestamp?: string;
  lastTimestamp?: string;
}

export interface DailyCount {
  date: string; // YYYY-MM-DD
  total: number;
  publicCount: number;
  internalCount: number;
}

export interface TopQuestion {
  text: string;
  count: number;
}

export function readLogEntries(limit = 200): IlimexBotLogEntry[] {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  const raw = fs.readFileSync(LOG_FILE, "utf8");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Take the most recent `limit` entries
  const recent = lines.slice(-limit);

  const entries: IlimexBotLogEntry[] = [];
  for (const line of recent) {
    try {
      const parsed = JSON.parse(line) as IlimexBotLogEntry;
      entries.push(parsed);
    } catch (err) {
      console.error("Failed to parse log line:", err);
    }
  }

  return entries;
}

export function computeSummary(
  entries: IlimexBotLogEntry[],
): IlimexAnalyticsSummary {
  const totalInteractions = entries.length;
  let publicCount = 0;
  let internalCount = 0;
  let latencySum = 0;

  if (totalInteractions === 0) {
    return {
      totalInteractions: 0,
      publicCount: 0,
      internalCount: 0,
      avgLatencyMs: null,
    };
  }

  for (const e of entries) {
    if (e.mode === "public") publicCount += 1;
    if (e.mode === "internal") internalCount += 1;
    latencySum += e.latencyMs ?? 0;
  }

  const avgLatencyMs = latencySum / totalInteractions;

  const sortedByTime = [...entries].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() -
      new Date(b.timestamp).getTime(),
  );

  return {
    totalInteractions,
    publicCount,
    internalCount,
    avgLatencyMs,
    firstTimestamp: sortedByTime[0]?.timestamp,
    lastTimestamp: sortedByTime[sortedByTime.length - 1]?.timestamp,
  };
}

// Group counts by day
export function computeDailyCounts(
  entries: IlimexBotLogEntry[],
): DailyCount[] {
  const byDate: Record<string, DailyCount> = {};

  for (const e of entries) {
    const d = new Date(e.timestamp);
    if (Number.isNaN(d.getTime())) continue;

    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD

    if (!byDate[key]) {
      byDate[key] = {
        date: key,
        total: 0,
        publicCount: 0,
        internalCount: 0,
      };
    }

    byDate[key].total += 1;
    if (e.mode === "public") byDate[key].publicCount += 1;
    if (e.mode === "internal") byDate[key].internalCount += 1;
  }

  return Object.values(byDate).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

// Crude "top questions" by normalising user messages
export function computeTopQuestions(
  entries: IlimexBotLogEntry[],
  max = 10,
): TopQuestion[] {
  const counts: Record<string, number> = {};

  for (const e of entries) {
    const raw = (e.userMessage || "").trim();
    if (!raw) continue;

    // Normalise: lowercase, collapse whitespace, strip trailing punctuation
    let norm = raw.toLowerCase();
    norm = norm.replace(/\s+/g, " ");
    norm = norm.replace(/[!?.,;:]+$/g, "");

    // Shorten very long messages to keep them readable
    if (norm.length > 160) {
      norm = norm.slice(0, 157) + "...";
    }

    counts[norm] = (counts[norm] || 0) + 1;
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([text, count]) => ({ text, count }));

  return sorted;
}
