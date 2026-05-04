"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicConfig } from "@/components/config-provider";

// Surfaces the shape `/api/health/data-source` emits:
//   api    → { mode: "api", ok, latencyMs }
//   hybrid → { mode: "hybrid", ok, dbLatencyMs, apiLatencyMs }
async function fetchHealth() {
  const res = await fetch("/api/health/data-source", { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || "Probe failed");
    err.body = body;
    throw err;
  }
  return body;
}

export function DataSourceCard() {
  const { dataSource } = usePublicConfig();
  const { data, error, isLoading } = useQuery({
    queryKey: ["health", "data-source"],
    queryFn: fetchHealth,
    staleTime: 30_000,
    retry: false,
  });

  const mode = data?.mode || dataSource || "api";
  const ok = data?.ok === true;
  const errorMessage = error?.message || data?.error || null;

  const dot = isLoading
    ? "bg-fg-faint animate-pulse"
    : ok
      ? "bg-success"
      : "bg-pri-high";

  return (
    <section className="bg-surface-elevated border border-border rounded-2xl p-5 mb-6">
      <header className="flex items-center gap-2 mb-3">
        <h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-fg m-0">
          Data source
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 ml-auto px-2 h-5 rounded-full text-[10.5px] font-bold uppercase tracking-wider ${
            mode === "hybrid"
              ? "bg-tag-backend-bg text-tag-backend-fg"
              : "bg-surface-muted text-fg-muted"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
          {mode}
        </span>
      </header>

      <p className="text-[13px] text-fg-muted m-0 mb-3">
        {mode === "hybrid"
          ? "Reads come from OpenProject's Postgres directly; writes round-trip the OpenProject API for journal/notification safety."
          : "Every read and write goes through OpenProject's v3 API."}
      </p>

      {isLoading ? (
        <div className="text-[12px] text-fg-faint">Probing…</div>
      ) : !ok ? (
        <div className="text-[12px] text-pri-high">
          Probe failed{errorMessage ? `: ${errorMessage}` : ""}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] m-0">
          {data.dbLatencyMs != null && (
            <>
              <dt className="text-fg-muted">DB latency</dt>
              <dd className="text-fg font-medium tabular-nums m-0">
                {data.dbLatencyMs} ms
              </dd>
            </>
          )}
          {data.apiLatencyMs != null && (
            <>
              <dt className="text-fg-muted">API latency</dt>
              <dd className="text-fg font-medium tabular-nums m-0">
                {data.apiLatencyMs} ms
              </dd>
            </>
          )}
          {data.latencyMs != null && (
            <>
              <dt className="text-fg-muted">Latency</dt>
              <dd className="text-fg font-medium tabular-nums m-0">
                {data.latencyMs} ms
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
