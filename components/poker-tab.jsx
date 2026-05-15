"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { T_SHIRT_TO_POINTS } from "@/lib/openproject/story-points-constants";
import { usePokerRoom } from "@/lib/hooks/use-poker-room";
import { friendlyError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// Planning-poker as a task-detail tab. Mounted only while the "Poker"
// sidebar tab is active in TaskDetail; unmounting tears down the SSE
// connection and removes the user from the room.
//
// The whole surface is scoped as a `@container/poker` so card and
// hero sizes scale with the panel width (~280px on xl, ~1000px on
// small modals) rather than the viewport — what's "wide" here is
// the sidebar, not the page.
export function PokerTab({ task, allowed: allowedRaw, canEdit, onUpdate, onApplied }) {
  // OpenProject's allowedValues includes a "None" sentinel — strip it so
  // players can't vote for a no-value option in a poker round.
  const allowed = Array.isArray(allowedRaw)
    ? allowedRaw.filter((o) => o.value != null && String(o.value).trim() !== "" && String(o.value).toLowerCase() !== "none")
    : allowedRaw;

  const taskId = task?.id ? String(task.id) : null;
  const room = usePokerRoom({ taskId, enabled: true });
  const { state, connected, vote, reveal, reset, roomReset } = room;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [applied, setApplied] = useState(false);

  const viewerId = state?.viewerId || null;
  const players = useMemo(
    () => (state?.players ? Object.values(state.players) : []),
    [state],
  );
  const me = viewerId ? state?.players?.[viewerId] : null;
  const myVote = me?.vote ?? null;
  const revealed = !!state?.revealed;

  const votedCount = players.filter((p) => p.hasVoted).length;
  const totalPlayers = players.length;

  const tally = useMemo(() => {
    if (!revealed) return null;
    const counts = {};
    for (const p of players) {
      if (p.vote) counts[p.vote] = (counts[p.vote] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    const [winner, winnerCount] = sorted[0];
    const tied = sorted.filter(([, c]) => c === winnerCount).length > 1;
    const totalVotes = sorted.reduce((sum, [, c]) => sum + c, 0);
    return { winner, winnerCount, tied, counts, totalVotes };
  }, [revealed, players]);

  const winnerOption = useMemo(() => {
    if (!tally) return null;
    return allowed.find((o) => o.value === tally.winner) || null;
  }, [tally, allowed]);

  // Hero state: what the big card shows.
  //   "results"   — round revealed, show winner (or tied banner)
  //   "yours"     — you've voted, show your pick face-up
  //   "waiting"   — you haven't voted yet, prompt to pick
  const heroMode = revealed ? "results" : myVote ? "yours" : "waiting";

  useEffect(() => {
    if (!applied) return undefined;
    let alive = true;
    (async () => {
      try {
        await reset();
      } catch {
        // ignore — handing off anyway
      }
      if (alive) onApplied?.();
    })();
    return () => {
      alive = false;
    };
  }, [applied, reset, onApplied]);

  if (!Array.isArray(allowed) || allowed.length === 0) {
    return (
      <div className="pt-3 text-[13px] text-fg-subtle">
        Planning poker is only available for projects with a t-shirt-style
        story-points field.
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="pt-3 text-[13px] text-fg-subtle">
        You don&apos;t have permission to estimate this work package.
      </div>
    );
  }

  const wrap = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const handleVote = (value) => wrap(() => vote(value));
  const handleReveal = () => wrap(() => reveal());
  const handleReset = () => wrap(() => reset());

  const handleApply = () => {
    if (!winnerOption || !task?.id) return;
    onUpdate?.(task.id, {
      points: winnerOption.value,
      pointsHref: winnerOption.href,
    });
    setApplied(true);
  };

  return (
    <div className="@container/poker pt-2 pb-1">
      {!connected ? (
        <ConnectingState />
      ) : (
        <div className="flex flex-col gap-3">
          <Header
            connected={connected}
            votedCount={votedCount}
            totalPlayers={totalPlayers}
            revealed={revealed}
            roomReset={roomReset}
          />

          <Hero
            mode={heroMode}
            myVote={myVote}
            tally={tally}
            winnerOption={winnerOption}
            onApply={handleApply}
            onReset={handleReset}
            busy={busy}
          />

          {totalPlayers > 0 && (
            <PlayerStrip
              players={players}
              viewerId={viewerId}
              revealed={revealed}
            />
          )}

          {!revealed && (
            <CardPicker
              allowed={allowed}
              myVote={myVote}
              onVote={handleVote}
              busy={busy}
            />
          )}

          {revealed && tally && tally.totalVotes > 0 && (
            <Distribution allowed={allowed} tally={tally} />
          )}

          {error && (
            <div className="px-3 py-2 rounded-md bg-pri-lowest border border-pri-low text-[12px] text-pri-highest">
              {error}
            </div>
          )}

          {!revealed && (
            <FooterActions
              busy={busy}
              canReveal={votedCount > 0}
              onReveal={handleReveal}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ConnectingState() {
  return (
    <div className="pt-3">
      <div className="rounded-lg border border-border-soft bg-surface-elevated p-6 text-center">
        <Icon
          name="loader"
          size={20}
          className="animate-spin mx-auto mb-2 text-accent"
        />
        <div className="text-[12.5px] text-fg-muted">Joining the room…</div>
      </div>
    </div>
  );
}

// Top status row: live dot + "X of Y voted" or revealed pill.
function Header({ votedCount, totalPlayers, revealed, roomReset }) {
  return (
    <div className="flex items-center justify-between">
      <div className="inline-flex items-center gap-1.5">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-emerald-500/60 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[11px] uppercase tracking-wider font-semibold text-fg-muted">
          {revealed ? "Revealed" : "Live"}
        </span>
      </div>
      {!revealed ? (
        <span className="text-[11.5px] text-fg-subtle tabular-nums">
          {votedCount}/{totalPlayers} voted
        </span>
      ) : (
        <span className="text-[11.5px] text-fg-subtle tabular-nums">
          {totalPlayers} {totalPlayers === 1 ? "player" : "players"}
        </span>
      )}
      {roomReset && (
        <span className="text-[10.5px] uppercase tracking-wider font-semibold text-fg-subtle">
          · reset
        </span>
      )}
    </div>
  );
}

// The big focal card. Three modes: waiting (you haven't voted), yours
// (you've voted, card shows your pick face-up), results (revealed).
function Hero({ mode, myVote, tally, winnerOption, onApply, onReset, busy }) {
  if (mode === "waiting") {
    return (
      <div className="rounded-xl border-2 border-dashed border-border bg-surface-sunken px-4 py-6 text-center">
        <div className="text-[12px] text-fg-subtle">
          Pick a card below to cast your vote.
        </div>
      </div>
    );
  }

  if (mode === "yours") {
    const points = T_SHIRT_TO_POINTS[String(myVote).toUpperCase()];
    return (
      <div className="rounded-xl border border-border bg-surface-elevated px-4 py-5 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-linear-to-br from-accent/5 to-transparent" />
        <div className="relative">
          <div className="text-[10.5px] uppercase tracking-wider font-semibold text-fg-subtle mb-1">
            Your pick
          </div>
          <PlayingCard value={myVote} points={points} size="hero" />
          <div className="text-[11px] text-fg-subtle mt-2">
            Tap a different card below to change.
          </div>
        </div>
      </div>
    );
  }

  // mode === "results"
  if (!tally) {
    return (
      <div className="rounded-xl border border-border bg-surface-sunken px-4 py-6 text-center">
        <div className="text-[12px] text-fg-subtle">No votes were cast.</div>
      </div>
    );
  }
  const points = winnerOption
    ? T_SHIRT_TO_POINTS[String(winnerOption.value).toUpperCase()]
    : null;
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-elevated px-4 py-5 text-center relative overflow-hidden",
        tally.tied
          ? "border-border"
          : "border-accent/40 ring-1 ring-accent/20",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 pointer-events-none",
          tally.tied
            ? "bg-linear-to-br from-fg-subtle/5 to-transparent"
            : "bg-linear-to-br from-accent/10 to-transparent",
        )}
      />
      <div className="relative">
        <div className="text-[10.5px] uppercase tracking-wider font-semibold text-fg-subtle mb-1">
          {tally.tied ? "Tie — re-vote suggested" : "Consensus"}
        </div>
        <PlayingCard
          value={winnerOption?.value || tally.winner}
          points={points}
          size="hero"
          accent={!tally.tied}
        />
        <div className="text-[11px] text-fg-muted mt-2 tabular-nums">
          {tally.winnerCount} of {tally.totalVotes}{" "}
          {tally.totalVotes === 1 ? "vote" : "votes"}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <ActionButton
            variant="secondary"
            disabled={busy}
            onClick={onReset}
            icon="refresh"
          >
            Re-vote
          </ActionButton>
          <ActionButton
            variant="primary"
            disabled={busy || !winnerOption}
            onClick={onApply}
            icon="check"
          >
            Apply {winnerOption?.value || tally.winner}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

// Compact horizontal player chips. Each shows initials in a circular
// avatar with a status dot (or revealed vote) at the bottom-right.
function PlayerStrip({ players, viewerId, revealed }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface-sunken p-2.5">
      <ul className="flex flex-wrap gap-2 m-0 p-0 list-none">
        {players.map((p) => (
          <li
            key={p.userId}
            className={cn(
              "inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full",
              "bg-surface-elevated border",
              p.userId === viewerId
                ? "border-accent/40"
                : "border-border-soft",
            )}
            title={p.name}
          >
            <PlayerAvatar
              name={p.name}
              hasVoted={p.hasVoted}
              vote={p.vote}
              revealed={revealed}
              isViewer={p.userId === viewerId}
            />
            <span
              className={cn(
                "text-[11.5px] truncate max-w-[10ch] @[420px]/poker:max-w-[16ch]",
                p.userId === viewerId
                  ? "text-fg font-medium"
                  : "text-fg-muted",
              )}
            >
              {p.userId === viewerId ? "You" : p.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerAvatar({ name, hasVoted, vote, revealed, isViewer }) {
  const initials = String(name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-fg-muted shrink-0">
      {initials || "?"}
      {revealed && vote ? (
        <span className="absolute -bottom-0.5 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-on-accent text-[9px] font-semibold inline-flex items-center justify-center">
          {vote}
        </span>
      ) : (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface-elevated",
            hasVoted
              ? "bg-emerald-500"
              : isViewer
              ? "bg-accent"
              : "bg-fg-faint",
          )}
        />
      )}
    </span>
  );
}

// Card picker grid. Tap targets are at least 44px tall on mobile (h-12)
// and scale down to 40px once the container can fit a wider layout.
function CardPicker({ allowed, myVote, onVote, busy }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-fg-subtle mb-1.5 px-0.5">
        Cards
      </div>
      <div className="flex flex-wrap gap-2">
        {allowed.map((o) => {
          const active = myVote === o.value;
          const points = T_SHIRT_TO_POINTS[String(o.value).toUpperCase()];
          return (
            <PlayingCard
              key={o.value}
              value={o.value}
              points={points}
              size="grid"
              active={active}
              disabled={busy}
              onClick={() => onVote(o.value)}
            />
          );
        })}
      </div>
    </div>
  );
}

// A single playing card. Three sizes:
//   "hero"    — big focal card in the Hero (centered, ~88px)
//   "grid"    — medium tap-friendly card in the picker grid
//   "stat"    — small card used in the distribution row
function PlayingCard({
  value,
  points,
  size = "grid",
  active = false,
  accent = false,
  disabled = false,
  onClick,
}) {
  const isButton = typeof onClick === "function";
  const Tag = isButton ? "button" : "div";
  const baseClasses = "relative inline-flex flex-col items-center justify-center rounded-md border font-semibold tracking-wider tabular-nums select-none";

  let sizeClasses = "";
  if (size === "hero") {
    sizeClasses =
      "w-20 h-28 @[420px]/poker:w-24 @[420px]/poker:h-32 mx-auto text-[28px] @[420px]/poker:text-[32px] gap-0.5";
  } else if (size === "grid") {
    sizeClasses =
      "h-14 min-w-12 @[420px]/poker:h-12 @[420px]/poker:min-w-11 px-2 text-[15px] @[420px]/poker:text-[14px]";
  } else if (size === "stat") {
    sizeClasses = "h-9 min-w-9 px-2 text-[12px]";
  }

  const tone = active
    ? "bg-accent text-on-accent border-accent shadow-sm"
    : accent
    ? "bg-surface-elevated text-fg border-accent/40"
    : "bg-surface-elevated text-fg border-border-soft";

  const interactive = isButton
    ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-sm hover:border-border-strong active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
    : "";

  return (
    <Tag
      type={isButton ? "button" : undefined}
      onClick={onClick}
      disabled={isButton ? disabled : undefined}
      title={`${points ?? "?"} pts`}
      aria-label={`${value} (${points ?? "?"} points)`}
      aria-pressed={isButton ? active : undefined}
      className={cn(baseClasses, sizeClasses, tone, interactive)}
    >
      <span className="leading-none">{value}</span>
      {(size === "hero" || (size === "grid" && active)) && points != null && (
        <span
          className={cn(
            "leading-none font-medium",
            size === "hero" ? "text-[10.5px] mt-1" : "text-[9px] mt-0.5",
            active ? "opacity-90" : "opacity-70",
          )}
        >
          {points} pts
        </span>
      )}
    </Tag>
  );
}

// Horizontal-bar distribution after reveal. Each card with at least
// one vote shows a bar proportional to its share of total votes.
function Distribution({ allowed, tally }) {
  // Only show cards that received at least one vote, in tally order.
  const entries = Object.entries(tally.counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-border-soft bg-surface-sunken p-2.5">
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-fg-subtle mb-2">
        Distribution
      </div>
      <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
        {entries.map(([value, count]) => {
          const isWinner = value === tally.winner && !tally.tied;
          const pct = Math.round((count / tally.totalVotes) * 100);
          const points = T_SHIRT_TO_POINTS[String(value).toUpperCase()];
          const inAllowed = allowed.find((o) => o.value === value);
          return (
            <li key={value} className="flex items-center gap-2">
              <span
                className={cn(
                  "min-w-9 h-7 px-2 inline-flex items-center justify-center rounded text-[12px] font-semibold uppercase tracking-wider tabular-nums shrink-0",
                  isWinner
                    ? "bg-accent text-on-accent"
                    : "bg-surface-muted text-fg",
                )}
                title={`${points ?? "?"} pts${inAllowed ? "" : " (not in current schema)"}`}
              >
                {value}
              </span>
              <div className="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    isWinner ? "bg-accent" : "bg-fg-muted/40",
                  )}
                  style={{ width: `${Math.max(6, pct)}%` }}
                />
              </div>
              <span className="text-[11px] text-fg-subtle tabular-nums w-10 text-right shrink-0">
                ×{count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Footer action row used pre-reveal. Post-reveal actions live inside
// the Hero card next to the winning size.
function FooterActions({ busy, canReveal, onReveal }) {
  return (
    <div className="flex items-center justify-end pt-1">
      <ActionButton
        variant="primary"
        disabled={busy || !canReveal}
        onClick={onReveal}
        icon="eye"
        title={canReveal ? "Reveal votes" : "Waiting for at least one vote"}
      >
        Reveal
      </ActionButton>
    </div>
  );
}

function ActionButton({
  variant = "primary",
  disabled,
  onClick,
  icon,
  title,
  children,
}) {
  const variantClasses =
    variant === "primary"
      ? "bg-accent text-on-accent border-accent hover:bg-accent-600 hover:border-accent-600"
      : "bg-surface-elevated text-fg border-border hover:bg-surface-subtle hover:border-border-strong";
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-10 @[420px]/poker:h-9 px-3.5 rounded-md border text-[13px] font-medium cursor-pointer transition-colors",
        variantClasses,
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}
