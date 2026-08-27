"use client";

import { useEffect, useState } from "react";

const TOKEN_KEY = "ilimex_admin_token";

type AnalyticsData = {
  days: number;
  mode: "all" | "external" | "internal";
  summary: {
    total_interactions?: number;
    external_count?: number;
    internal_count?: number;
    avg_latency_ms?: number | null;
    first_timestamp?: string | null;
    last_timestamp?: string | null;
  };
  daily: Array<{ date: string; total: number; external_count: number; internal_count: number }>;
  topQuestions: Array<{ text: string; count: number }>;
};

function getToken() {
  const saved = window.sessionStorage.getItem(TOKEN_KEY)?.trim() ?? "";
  if (saved) return saved;
  const entered = window.prompt("Enter the Ilimex internal admin token")?.trim() ?? "";
  if (entered) window.sessionStorage.setItem(TOKEN_KEY, entered);
  return entered;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState<"all" | "external" | "internal">("all");

  async function load(nextDays = days, nextMode = mode) {
    setLoading(true);
    setError("");
    const token = getToken();
    if (!token) {
      setError("Admin token required.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/analytics-summary?days=${nextDays}&mode=${nextMode}`, {
        headers: { "x-admin-token": token },
        cache: "no-store",
      });
      if (res.status === 401) {
        window.sessionStorage.removeItem(TOKEN_KEY);
        throw new Error("Admin token rejected. Reload the page to try again.");
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Analytics request failed (${res.status}).`);
      setData(json as AnalyticsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(30, "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(nextDays: number, nextMode: "all" | "external" | "internal") {
    setDays(nextDays);
    setMode(nextMode);
    void load(nextDays, nextMode);
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">IlimexBot Analytics</h1>
        <p className="text-sm text-gray-600 mt-1">
          Authenticated analytics from the database-backed bot event store. Conversation snippets are redacted before storage.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map((value) => (
          <button key={value} onClick={() => apply(value, mode)} className="rounded border px-3 py-1 text-sm">
            {value} days
          </button>
        ))}
        {(["all", "external", "internal"] as const).map((value) => (
          <button key={value} onClick={() => apply(days, value)} className="rounded border px-3 py-1 text-sm capitalize">
            {value}
          </button>
        ))}
      </div>

      {loading && <p>Loading analytics…</p>}
      {error && <div className="rounded border p-4 text-sm">{error}</div>}

      {data && !loading && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Interactions" value={data.summary.total_interactions ?? 0} />
            <Metric label="External" value={data.summary.external_count ?? 0} />
            <Metric label="Internal" value={data.summary.internal_count ?? 0} />
            <Metric label="Avg latency" value={data.summary.avg_latency_ms == null ? "—" : `${data.summary.avg_latency_ms} ms`} />
          </section>

          <section className="rounded border p-4">
            <h2 className="font-semibold mb-3">Daily interactions</h2>
            {data.daily.length === 0 ? (
              <p className="text-sm text-gray-600">No events in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left"><th className="py-2">Date</th><th>Total</th><th>External</th><th>Internal</th></tr></thead>
                  <tbody>{data.daily.map((row) => <tr key={row.date} className="border-t"><td className="py-2">{row.date}</td><td>{row.total}</td><td>{row.external_count}</td><td>{row.internal_count}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded border p-4">
            <h2 className="font-semibold mb-3">Common redacted questions</h2>
            {data.topQuestions.length === 0 ? <p className="text-sm text-gray-600">No sampled snippets in this period.</p> : (
              <ol className="space-y-2 text-sm">
                {data.topQuestions.map((q, i) => <li key={`${q.text}-${i}`}><span className="font-medium">{q.count}×</span> {q.text}</li>)}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border p-4"><div className="text-xs uppercase tracking-wide text-gray-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}
