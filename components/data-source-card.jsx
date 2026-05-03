"use client";

import { useEffect, useState } from "react";
import { usePublicConfig } from "@/components/config-provider";

// Pulls `/api/health/data-source` once on mount, shows mode + latencies.
// Surfaces the same shape the server emits:
//   api    → { mode: "api", ok, latencyMs }
//   hybrid → { mode: "hybrid", ok, dbLatencyMs, apiLatencyMs }
export function DataSourceCard() {
  const { dataSource } = usePublicConfig();
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/data-source", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!cancelled) {
          setState({ status: res.ok ? "ok" : "error", data: body });
        }
      })
      .catch((e) => {
        if (!cancelled) setState({ status: "error", data: { error: e?.message } });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { status, data } = state;
  const mode = data?.mode || dataSource || "api";
  const ok = data?.ok === true;

  const dot =
    status === "loading"
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

      {status === "loading" ? (
        <div className="text-[12px] text-fg-faint">Probing…</div>
      ) : !ok ? (
        <div className="text-[12px] text-pri-high">
          Probe failed{data?.error ? `: ${data.error}` : ""}
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
