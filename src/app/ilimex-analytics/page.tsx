// src/app/ilimex-analytics/page.tsx
export const runtime = "nodejs";

import {
  readLogEntries,
  computeSummary,
  computeDailyCounts,
  computeTopQuestions,
} from "@/lib/analytics";
import type { IlimexBotLogEntry } from "@/lib/logger";

interface AnalyticsPageProps {
  searchParams?: {
    mode?: string;
    days?: string;
  };
}

export default function IlimexAnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  try {
    const modeFilter = (searchParams?.mode || "all") as
      | "all"
      | "public"
      | "internal";

    const daysFilterRaw = searchParams?.days ?? "0";
    const daysFilter = Number.isNaN(Number(daysFilterRaw))
      ? 0
      : parseInt(daysFilterRaw, 10); // 0 = all

    let entries: IlimexBotLogEntry[] = [];
    try {
      entries = readLogEntries(500);
    } catch (err) {
      console.error("Failed to read IlimexBot log entries:", err);
      entries = [];
    }

    const now = Date.now();
    let filtered: IlimexBotLogEntry[] = entries;

    // Time window filter
    if (daysFilter > 0) {
      const cutoff = now - daysFilter * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return !Number.isNaN(t) && t >= cutoff;
      });
    }

    // Mode filter
    if (modeFilter === "public") {
      filtered = filtered.filter((e) => e.mode === "public");
    } else if (modeFilter === "internal") {
      filtered = filtered.filter((e) => e.mode === "internal");
    }

    const summary = computeSummary(filtered);
    const daily = computeDailyCounts(filtered);
    const topQuestions = computeTopQuestions(filtered, 10);

    const maxDaily =
      daily.length > 0
        ? Math.max(...daily.map((d) => d.total))
        : 0;

    const labelForMode =
      modeFilter === "all"
        ? "All modes"
        : modeFilter === "public"
          ? "Public only"
          : "Internal only";

    const labelForDays =
      !daysFilter || Number.isNaN(daysFilter)
        ? "All time (within last 500 entries)"
        : `Last ${daysFilter} days (within last 500 entries)`;

    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold mb-2">
          IlimexBot Analytics
        </h1>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center text-xs mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-600">
              Mode:
            </span>
            <a
              href="/ilimex-analytics"
              className={`px-2 py-1 rounded border ${
                modeFilter === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              All
            </a>
            <a
              href="/ilimex-analytics?mode=public"
              className={`px-2 py-1 rounded border ${
                modeFilter === "public"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              Public
            </a>
            <a
              href="/ilimex-analytics?mode=internal"
              className={`px-2 py-1 rounded border ${
                modeFilter === "internal"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              Internal
            </a>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-600">
              Time:
            </span>
            <a
              href={`/ilimex-analytics?mode=${modeFilter}`}
              className={`px-2 py-1 rounded border ${
                !daysFilter || Number.isNaN(daysFilter)
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              All
            </a>
            <a
              href={`/ilimex-analytics?mode=${modeFilter}&days=7`}
              className={`px-2 py-1 rounded border ${
                daysFilter === 7
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              Last 7 days
            </a>
            <a
              href={`/ilimex-analytics?mode=${modeFilter}&days=30`}
              className={`px-2 py-1 rounded border ${
                daysFilter === 30
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              Last 30 days
            </a>
          </div>
        </div>

        {/* Context labels */}
        <div className="text-xs text-gray-500">
          <div>{labelForMode}</div>
          <div>{labelForDays}</div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="border rounded-xl p-4">
            <div className="text-xs text-gray-500">
              Total interactions
            </div>
            <div className="text-xl font-semibold">
              {summary.totalInteractions}
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="text-xs text-gray-500">
              Public interactions
            </div>
            <div className="text-xl font-semibold">
              {summary.publicCount}
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="text-xs text-gray-500">
              Internal interactions
            </div>
            <div className="text-xl font-semibold">
              {summary.internalCount}
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="text-xs text-gray-500">
              Avg latency (ms)
            </div>
            <div className="text-xl font-semibold">
              {summary.avgLatencyMs !== null
                ? summary.avgLatencyMs.toFixed(0)
                : "—"}
            </div>
          </div>
        </div>

        {/* Time range info */}
        <div className="text-xs text-gray-500">
          {summary.firstTimestamp && summary.lastTimestamp ? (
            <>
              Showing {filtered.length} interactions from{" "}
              <span className="font-medium">
                {new Date(
                  summary.firstTimestamp,
                ).toLocaleString()}
              </span>{" "}
              to{" "}
              <span className="font-medium">
                {new Date(
                  summary.lastTimestamp,
                ).toLocaleString()}
              </span>
              .
            </>
          ) : (
            "No interactions in this filter."
          )}
        </div>

        {/* Daily activity */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium">
            Daily activity ({filtered.length} interactions)
          </div>
          {daily.length === 0 ? (
            <div className="text-xs text-gray-500">
              No data for this filter.
            </div>
          ) : (
            <div className="space-y-2">
              {daily.map((d) => {
                const widthPct =
                  maxDaily > 0
                    ? Math.max(
                        5,
                        (d.total / maxDaily) * 100,
                      )
                    : 0;
                return (
                  <div
                    key={d.date}
                    className="flex items-center gap-2"
                  >
                    <div className="w-24 text-xs text-gray-600">
                      {d.date}
                    </div>
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-3 rounded-full bg-blue-200"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="w-20 text-right text-xs text-gray-600">
                      {d.total} total
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top questions */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium">
            Top questions ({filtered.length} interactions)
          </div>
          {topQuestions.length === 0 ? (
            <div className="text-xs text-gray-500">
              No questions to display for this filter.
            </div>
          ) : (
            <ul className="space-y-2 text-xs">
              {topQuestions.map((q, idx) => (
                <li
                  key={q.text + idx}
                  className="flex items-start gap-2"
                >
                  <span className="w-6 text-right text-gray-500">
                    {idx + 1}.
                  </span>
                  <span className="flex-1">
                    <span className="font-medium">
                      {q.count}×{" "}
                    </span>
                    {q.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent interactions */}
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-sm font-medium">
            Recent interactions
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    Time
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Mode
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    User message
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Assistant reply
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Latency (ms)
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-4 text-center text-gray-500"
                    >
                      No interactions in this filter.
                    </td>
                  </tr>
                ) : (
                  filtered
                    .slice()
                    .reverse()
                    .map((e, idx) => (
                      <tr
                        key={`${e.timestamp}-${idx}`}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-3 py-2 align-top">
                          {new Date(
                            e.timestamp,
                          ).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={
                              e.mode === "public"
                                ? "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700"
                                : "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700"
                            }
                          >
                            {e.mode}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top max-w-xs truncate">
                          {e.userMessage}
                        </td>
                        <td className="px-3 py-2 align-top max-w-xs truncate">
                          {e.assistantMessage}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          {Math.round(e.latencyMs)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    console.error("Ilimex analytics page error:", err);

    return (
      <div className="max-w-xl mx-auto p-6 space-y-3">
        <h1 className="text-xl font-semibold">
          IlimexBot Analytics
        </h1>
        <p className="text-sm text-gray-600">
          Sorry, there was a problem loading the analytics
          dashboard.
        </p>
        <p className="text-xs text-gray-500">
          Check the server logs for details. If this persists,
          the log format or analytics helpers may need to be
          updated.
        </p>
      </div>
    );
  }
}
