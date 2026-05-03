// Server-only visibility predicate builder.
//
// Every DB-mode read filters by what the viewer can see. Three rules apply
// uniformly:
//   1. The project is `active = TRUE` (archived projects are hidden, the
//      same way OP's UI / API hide them).
//   2. EITHER the project is `public = TRUE`, OR the viewer has a
//      membership-derived permission entry for it.
//   3. Admins bypass (1) and (2) entirely — they see everything.
//
// This function appends those conditions to a caller's existing
// `conditions` array and pushes any new params onto `params`. The caller
// supplies `pAlias` so it works against any local alias (`p`, `proj`, …).

/**
 * @param {{ params: any[], conditions: string[] }} state
 * @param {{ pAlias?: string, isAdmin?: boolean, projectIds?: number[] }} ctx
 */
export function applyProjectVisibility(state, ctx) {
  const alias = ctx.pAlias || "p";
  if (ctx.isAdmin) return; // admins see everything, including archived

  // Archived projects are hidden for non-admins regardless of membership.
  state.conditions.push(`${alias}.active = TRUE`);

  if (!ctx.projectIds || ctx.projectIds.length === 0) {
    state.conditions.push(`${alias}.public = TRUE`);
  } else {
    state.params.push(ctx.projectIds);
    state.conditions.push(
      `(${alias}.public = TRUE OR ${alias}.id = ANY($${state.params.length}::int[]))`,
    );
  }
}
