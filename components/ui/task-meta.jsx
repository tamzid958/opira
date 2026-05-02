"use client";

import { PriorityIcon, TypeIcon } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";

// Thin wrappers that take a mapped task (the shape `mapWorkPackage` returns)
// and forward the API-truth fields onto the underlying primitive. Centralises
// the prop-passing pattern so callers don't repeat `name=...` / `color=...`
// for every site that renders a status / type / priority chip.

export function TaskStatusPill({ task }) {
  if (!task) return null;
  return (
    <StatusPill
      name={task.statusName}
      isClosed={!!task.statusIsClosed}
      color={task.statusColor}
    />
  );
}

export function TaskTypeIcon({ task, size = 14 }) {
  if (!task) return null;
  return <TypeIcon name={task.typeName} color={task.typeColor} size={size} />;
}

export function TaskPriorityIcon({ task, size = 14 }) {
  if (!task) return null;
  return (
    <PriorityIcon
      name={task.priorityName}
      color={task.priorityColor}
      position={task.priorityPosition}
      totalPositions={task.priorityTotal}
      size={size}
    />
  );
}
