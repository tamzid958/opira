"use client";

import { useState } from "react";

// Saved board views — name + filter combo, persisted per-project to
// localStorage under `op:board-views:<projectId>`. Pure local state, no
// server round-trip; matches the "user preference" pattern already used
// for the per-project board sprint pick + view (kanban/list/swimlanes).

const STORAGE_PREFIX = "op:board-views";

function readStorage(projectId) {
  if (typeof window === "undefined" || !projectId) return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${projectId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(projectId, views) {
  if (typeof window === "undefined" || !projectId) return;
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}:${projectId}`,
      JSON.stringify(views),
    );
  } catch {
    // Quota / disabled storage. Silently drop.
  }
}

// Stable shape: { id, name, filters: { ... arbitrary keys ... } }.
// Filters stored as a plain object so the consumer can decide which keys
// matter (board has q/assignee/type/label/status; backlog could add more).
// In practice each project route remounts the hook so the initial-state
// reader picks up the right localStorage entry. If we ever reuse this hook
// across project transitions in a single component, callers should pass a
// `key={projectId}` on the parent to force a remount.
export function useSavedViews(projectId) {
  const [views, setViews] = useState(() => readStorage(projectId));

  const save = (name, filters) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const view = {
      id: `v-${Date.now().toString(36)}`,
      name: trimmed,
      filters,
    };
    setViews((prev) => {
      // Replace by name if it already exists — overwrite is the natural
      // behaviour after explicit confirm in the calling UI.
      const without = prev.filter(
        (v) => v.name.toLowerCase() !== trimmed.toLowerCase(),
      );
      const next = [...without, view];
      writeStorage(projectId, next);
      return next;
    });
    return view;
  };

  const remove = (id) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      writeStorage(projectId, next);
      return next;
    });
  };

  return { views, save, remove };
}
