"use client";

export function PageSkeleton({ title }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col" aria-busy="true" aria-label="Loading">
      <div className="bg-surface-elevated border-b border-border px-3 sm:px-6 pt-3.5 pb-3 shrink-0">
        {title ? (
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.022em] text-fg-subtle/30 m-0 select-none animate-pulse">
            {title}
          </h1>
        ) : (
          <div className="h-7 w-40 rounded-md bg-surface-muted animate-pulse" />
        )}
      </div>
      <div className="h-0.5 w-full bg-surface-muted overflow-hidden shrink-0">
        <div className="h-full w-1/3 bg-accent/50 animate-[progress_1.4s_ease-in-out_infinite]" />
      </div>
      <div className="flex-1 min-h-0 px-3 sm:px-6 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-24 rounded-md bg-surface-muted animate-pulse" />
          <div className="h-6 w-20 rounded-md bg-surface-muted animate-pulse" />
          <div className="ml-auto h-6 w-28 rounded-md bg-surface-muted animate-pulse" />
        </div>
        <div className="flex-1 rounded-lg border border-border-soft bg-surface-muted/40 animate-pulse" />
      </div>
    </div>
  );
}
