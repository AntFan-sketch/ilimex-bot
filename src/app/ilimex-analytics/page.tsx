// src/app/ilimex-analytics/page.tsx

export const runtime = "nodejs";

import {
  readLogEntries,
  computeSummary,
  computeDailyCounts,
  computeTopQuestions,
} from "@/lib/analytics";

export default function IlimexAnalyticsPage() {
  const entries = readLogEntries(200);
  const summary = computeSummary(entries);
  const daily = computeDailyCounts(entries);
  const topQuestions = computeTopQuestions(entries, 10);

  const maxDaily =
    daily.length > 0
      ? Math.max(...daily.map((d) => d.total))
      : 0;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold mb-2">
        IlimexBot Analytics
      </h1>

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
            Showing last {entries.length} interactions from{" "}
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
          "No interactions logged yet."
        )}
      </div>

      {/* Daily activity */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="text-sm font-medium">
          Daily activity (last {entries.length} interactions)
        </div>
        {daily.length === 0 ? (
          <div className="text-xs text-gray-500">
            No data yet.
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
          Top questions (last {entries.length} interactions)
        </div>
        {topQuestions.length === 0 ? (
          <div className="text-xs text-gray-500">
            No questions to display yet.
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

      {/* Recent interactions table */}
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
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    No interactions logged yet.
                  </td>
                </tr>
              ) : (
                entries
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
}
