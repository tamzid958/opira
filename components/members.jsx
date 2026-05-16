"use client";

import { useState } from "react";
import { Users as UsersIcon } from "lucide-react";
import { formatAbsDate } from "@/lib/utils";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingPill } from "@/components/ui/loading-pill";
import { Menu } from "@/components/ui/menu";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/icons";
import {
  useAddMember,
  useProjectMembers,
  useRemoveMember,
  useRoles,
  useUpdateMember,
} from "@/lib/hooks/use-openproject-detail";
import { useUsers } from "@/lib/hooks/use-openproject";
import { friendlyError } from "@/lib/api-client";

// Project members + role management. The OP v3 spec exposes:
//   GET /memberships?filters=[{project:=,values:[id]}] — list
//   POST /memberships                                  — add
//   PATCH /memberships/{id}                            — change roles
//   DELETE /memberships/{id}                           — remove
//   GET /roles                                         — role catalog
// Permissions per-row come from `_links.update` / `_links.delete`.

function RolePills({ roles }) {
  if (!roles?.length) {
    return <span className="text-fg-faint text-[12px]">No role</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r.id}
          className="inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-semibold uppercase tracking-wider bg-accent-50 text-accent-700"
        >
          {r.name}
        </span>
      ))}
    </div>
  );
}

function RoleEditor({ memberId, currentIds, roles, onChange, busy }) {
  const [rect, setRect] = useState(null);
  const selected = new Set((currentIds || []).map(String));
  return (
    <>
      <button
        type="button"
        onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}
        disabled={busy}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11.5px] font-medium text-fg-muted hover:bg-surface-subtle hover:text-fg cursor-pointer disabled:opacity-50"
        title="Change roles"
      >
        <Icon name="edit" size={11} aria-hidden="true" />
        Edit
      </button>
      {rect && (
        <Menu
          anchorRect={rect}
          align="right"
          width={220}
          onClose={() => setRect(null)}
          onSelect={(it) => {
            const next = new Set(selected);
            if (next.has(String(it.value))) next.delete(String(it.value));
            else next.add(String(it.value));
            // Keep the menu open for multi-select feel: dispatch the
            // change but don't close. The user clicks outside to commit.
            onChange([...next]);
          }}
          items={(roles || []).map((r) => ({
            label: r.name,
            value: r.id,
            active: selected.has(String(r.id)),
          }))}
        />
      )}
    </>
  );
}

// Multi-select role dropdown. Trigger renders a summary of picked roles
// (or "Select roles…"); clicking opens a Menu with checkable options.
// The menu stays open across clicks because picking multiple roles is
// the whole point — outside-click closes it via Menu's own handler.
function RoleDropdownField({ roles, roleIds, onChange, loading, label = "Roles" }) {
  const [rect, setRect] = useState(null);
  const idSet = new Set((roleIds || []).map(String));
  const picked = (roles || []).filter((r) => idSet.has(String(r.id)));
  return (
    <div>
      <label className="block text-[12px] font-medium text-fg-muted mb-1.5">{label}</label>
      <button
        type="button"
        onClick={(e) => setRect(e.currentTarget.getBoundingClientRect())}
        disabled={loading}
        className="w-full flex items-center gap-2 min-h-10 px-3 py-1.5 rounded-lg border border-border bg-surface-elevated text-[14px] text-fg cursor-pointer transition-colors hover:bg-surface-subtle hover:border-border-strong disabled:opacity-50"
      >
        {picked.length === 0 ? (
          <span className="text-fg-faint">
            {loading ? "Loading roles…" : "Select roles…"}
          </span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {picked.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-semibold uppercase tracking-wider bg-accent-50 text-accent-700"
              >
                {r.name}
              </span>
            ))}
          </span>
        )}
        <Icon
          name="chev-down"
          size={12}
          className="ml-auto text-fg-subtle"
          aria-hidden="true"
        />
      </button>
      {rect && (
        <Menu
          anchorRect={rect}
          width={Math.max(220, rect.width)}
          onClose={() => setRect(null)}
          onSelect={(it) => {
            const v = String(it.value);
            const next = idSet.has(v)
              ? [...idSet].filter((x) => x !== v)
              : [...idSet, v];
            onChange(next);
          }}
          searchable={(roles?.length || 0) > 6}
          searchPlaceholder="Search roles…"
          items={(roles || []).map((r) => ({
            label: r.name,
            value: r.id,
            active: idSet.has(String(r.id)),
          }))}
        />
      )}
    </div>
  );
}

function InviteModal({ projectId, onClose, currentMemberIds }) {
  const usersQ = useUsers();
  const rolesQ = useRoles();
  const addMember = useAddMember(projectId);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  const [roleIds, setRoleIds] = useState([]);
  const [sendNotification, setSendNotification] = useState(true);
  const [message, setMessage] = useState("");

  // Filter to users not already in the project. Search by name/email.
  const candidates = (() => {
    const all = usersQ.data || [];
    const exclude = new Set(currentMemberIds.map(String));
    const q = query.trim().toLowerCase();
    return all
      .filter((u) => !exclude.has(String(u.id)))
      .filter((u) =>
        !q ||
        u.name?.toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  })();

  const submit = async () => {
    if (!picked || roleIds.length === 0) return;
    try {
      await addMember.mutateAsync({
        principalId: picked.id,
        roleIds,
        sendNotification,
        message: sendNotification ? message : undefined,
      });
      toast.success(`${picked.name} added to project`);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't add member."));
    }
  };

  const canSubmit = !!picked && roleIds.length > 0 && !addMember.isPending;

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center p-3 sm:p-6 scrim animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-elevated rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-slide-up max-h-[calc(100vh-48px)]">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.018em] text-fg m-0">Add member</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:bg-surface-subtle hover:text-fg cursor-pointer"
          >
            <Icon name="x" size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 pb-4 grid gap-4 overflow-y-auto">
          {/* Person */}
          <div>
            <label className="block text-[12px] font-medium text-fg-muted mb-1.5">
              Person
            </label>
            {picked ? (
              <div className="flex items-center justify-between gap-2 h-10 px-3 rounded-lg border border-border bg-surface-elevated">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={picked} size="sm" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-fg truncate">
                      {picked.name}
                    </div>
                    {picked.email && (
                      <div className="text-[11px] text-fg-subtle truncate">
                        {picked.email}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="text-fg-subtle hover:text-fg cursor-pointer"
                  aria-label="Clear selection"
                >
                  <Icon name="x" size={12} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people…"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-surface-elevated text-[14px] text-fg placeholder:text-fg-faint outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]"
                />
                {query && (
                  <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-border-soft bg-surface-elevated">
                    {usersQ.isLoading ? (
                      <div className="px-3 py-2 text-[12px] text-fg-subtle">Loading…</div>
                    ) : candidates.length === 0 ? (
                      <div className="px-3 py-2 text-[12px] text-fg-subtle">
                        No matches.
                      </div>
                    ) : (
                      candidates.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setPicked(u);
                            setQuery("");
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-subtle cursor-pointer"
                        >
                          <Avatar user={u} size="sm" />
                          <div className="min-w-0">
                            <div className="text-[12.5px] text-fg truncate">{u.name}</div>
                            {u.email && (
                              <div className="text-[10.5px] text-fg-subtle truncate">
                                {u.email}
                              </div>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Roles — dropdown, multi-select */}
          <RoleDropdownField
            roles={rolesQ.data || []}
            roleIds={roleIds}
            onChange={setRoleIds}
            loading={rolesQ.isLoading}
          />
          {rolesQ.isLoading && (
            <div className="text-[11.5px] text-fg-subtle">Loading roles…</div>
          )}

          {/* Notification */}
          <div className="bg-surface-subtle rounded-lg p-3">
            <label className="inline-flex items-center gap-2 text-[12.5px] text-fg cursor-pointer">
              <input
                type="checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="accent-accent"
              />
              Send a welcome notification
            </label>
            {sendNotification && (
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional message…"
                rows={2}
                className="mt-2 w-full p-2 rounded-md border border-border bg-surface-elevated text-[12.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)] resize-y"
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-soft">
          <button
            type="button"
            onClick={onClose}
            disabled={addMember.isPending}
            className="inline-flex items-center h-9 px-3 rounded-lg text-fg-muted text-[13px] font-medium hover:bg-surface-subtle hover:text-fg cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center h-9 px-4 rounded-lg bg-accent text-on-accent text-[13px] font-semibold hover:bg-accent-600 cursor-pointer disabled:opacity-50"
          >
            {addMember.isPending ? "Adding…" : "Add to project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Stable color for a role name. Hashes the name so the same role always
// gets the same hue across renders. We use HSL to keep saturation in
// check and avoid the harsh primaries lucide produces on raw integers.
function roleHue(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function RoleChip({ role }) {
  const hue = roleHue(role.name);
  return (
    <span
      className="inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-semibold uppercase tracking-wider"
      style={{
        background: `hsl(${hue} 70% 95%)`,
        color: `hsl(${hue} 60% 32%)`,
      }}
    >
      {role.name}
    </span>
  );
}

function MemberRow({ member, roles, onEditRoles, onRemove, savingRoles }) {
  return (
    <div className="group flex items-center gap-4 px-4 py-3.5 hover:bg-surface-subtle transition-colors">
      <Avatar user={member} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[14px] font-semibold text-fg truncate">
            {member.principalName}
          </span>
          {member.principalType === "group" && (
            <span className="inline-flex items-center h-4 px-1 rounded text-[9.5px] font-semibold uppercase tracking-wider bg-surface-muted text-fg-muted">
              Group
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-fg-subtle">
          {member.principalEmail && (
            <span className="truncate max-w-[220px]">
              {member.principalEmail}
            </span>
          )}
          {member.principalEmail && member.createdAt && (
            <span className="text-fg-faint">·</span>
          )}
          {member.createdAt && (
            <span className="text-fg-faint">
              joined {formatAbsDate(member.createdAt, "—")}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 max-w-[260px] justify-end">
        {(member.roles || []).length > 0 ? (
          member.roles.map((r) => <RoleChip key={r.id} role={r} />)
        ) : (
          <span className="text-fg-faint text-[11.5px]">No role</span>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <RoleEditor
          memberId={member.id}
          currentIds={member.roleIds}
          roles={roles}
          busy={savingRoles}
          onChange={(ids) => onEditRoles(member, ids)}
        />
        <button
          type="button"
          onClick={() => onRemove(member)}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11.5px] font-medium text-pri-highest hover:bg-status-blocked-bg cursor-pointer"
          title="Remove from project"
        >
          <Icon name="trash" size={11} aria-hidden="true" />
          Remove
        </button>
      </div>
    </div>
  );
}

export function Members({ projectId, projectName }) {
  const membersQ = useProjectMembers(projectId);
  const rolesQ = useRoles();
  const updateMember = useUpdateMember(projectId);
  const removeMember = useRemoveMember(projectId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeFor, setRemoveFor] = useState(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sort, setSort] = useState("name");

  // Per-role counts drive the chip filter row at the top.
  const roleCounts = (() => {
    const acc = new Map();
    for (const m of membersQ.data || []) {
      for (const r of m.roleNames || []) {
        acc.set(r, (acc.get(r) || 0) + 1);
      }
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1]);
  })();

  const filtered = (() => {
    const list = membersQ.data || [];
    const q = query.trim().toLowerCase();
    let out = list;
    if (q) {
      out = out.filter(
        (m) =>
          m.principalName?.toLowerCase().includes(q) ||
          (m.principalEmail || "").toLowerCase().includes(q) ||
          (m.roleNames || []).some((r) => r.toLowerCase().includes(q)),
      );
    }
    if (roleFilter !== "all") {
      out = out.filter((m) => (m.roleNames || []).includes(roleFilter));
    }
    return [...out].sort((a, b) => {
      if (sort === "recent") {
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
      return (a.principalName || "").localeCompare(b.principalName || "");
    });
  })();

  const onChangeRoles = async (member, nextRoleIds) => {
    if (!nextRoleIds.length) {
      toast.error("A member must have at least one role");
      return;
    }
    try {
      await updateMember.mutateAsync({ id: member.id, roleIds: nextRoleIds });
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't update roles."));
    }
  };

  const total = (membersQ.data || []).length;

  return (
    <div className="max-w-5xl mx-auto px-1 py-2">
      {/* Hero */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-fg m-0">Members</h2>
          <p className="text-[13px] text-fg-subtle mt-1 m-0">
            People and groups with access to{" "}
            <strong>{projectName || "this project"}</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-accent text-on-accent text-[12.5px] font-semibold cursor-pointer transition-transform hover:-translate-y-px hover:bg-accent-600 shadow-(--card-highlight)"
        >
          <Icon name="plus" size={12} aria-hidden="true" />
          Add member
        </button>
      </div>

      {/* Stat / role filter strip */}
      {total > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <button
            type="button"
            onClick={() => setRoleFilter("all")}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium border cursor-pointer transition-colors ${
              roleFilter === "all"
                ? "bg-accent text-on-accent border-accent"
                : "bg-surface-elevated text-fg border-border hover:bg-surface-subtle hover:border-border-strong"
            }`}
          >
            All
            <span
              className={`inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold ${
                roleFilter === "all"
                  ? "bg-on-accent/15 text-on-accent"
                  : "bg-surface-muted text-fg-muted"
              }`}
            >
              {total}
            </span>
          </button>
          {roleCounts.map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setRoleFilter(name)}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium border cursor-pointer transition-colors ${
                roleFilter === name
                  ? "bg-accent text-on-accent border-accent"
                  : "bg-surface-elevated text-fg border-border hover:bg-surface-subtle hover:border-border-strong"
              }`}
            >
              {name}
              <span
                className={`inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold ${
                  roleFilter === name
                    ? "bg-on-accent/15 text-on-accent"
                    : "bg-surface-muted text-fg-muted"
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* List card */}
      <div className="bg-surface-elevated border border-border rounded-xl overflow-hidden">
        <div className="touch-toolbar flex items-center gap-2 px-4 py-2.5 border-b border-border-soft bg-surface-sunken">
          <div className="relative">
            <Icon
              name="search"
              size={12}
              className="absolute left-2.5 top-2 text-fg-faint pointer-events-none"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email or role…"
              className="w-[min(20rem,58vw)] sm:w-80 h-7 pl-7 pr-2 rounded-md border border-border bg-surface-elevated text-[12.5px] text-fg outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]"
            />
          </div>
          <div className="inline-flex rounded-md border border-border bg-surface-elevated p-0.5">
            {[
              { id: "name", label: "A → Z" },
              { id: "recent", label: "Recently joined" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSort(opt.id)}
                className={`inline-flex items-center h-6 px-2 rounded text-[11.5px] font-medium cursor-pointer ${
                  sort === opt.id
                    ? "bg-accent-50 text-accent-700"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[11.5px] text-fg-subtle">
            {filtered.length} of {total}
          </span>
        </div>

        {membersQ.isLoading ? (
          <div className="px-4 py-10 text-center">
            <LoadingPill label="loading members" />
          </div>
        ) : membersQ.error ? (
          <div className="px-4 py-6 text-[13px] text-pri-highest">
            {friendlyError(membersQ.error, "Couldn't load members.")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12">
            <EmptyState
              icon={UsersIcon}
              title={
                query || roleFilter !== "all" ? "No matches" : "No members yet"
              }
              body={
                query || roleFilter !== "all"
                  ? "Try a different search or filter."
                  : "Add the first person to start collaborating on this project."
              }
              action={
                !query && roleFilter === "all"
                  ? { label: "Add member", onClick: () => setInviteOpen(true) }
                  : null
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-border-soft">
            {filtered.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                roles={rolesQ.data || []}
                onEditRoles={onChangeRoles}
                onRemove={setRemoveFor}
                savingRoles={updateMember.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {inviteOpen && (
        <InviteModal
          projectId={projectId}
          onClose={() => setInviteOpen(false)}
          currentMemberIds={(membersQ.data || []).map((m) => m.principalId).filter(Boolean)}
        />
      )}

      {removeFor && (
        <ConfirmModal
          title={`Remove ${removeFor.principalName}?`}
          description="They'll lose access to this project. This can be re-added later."
          confirmLabel="Remove"
          destructive
          busy={removeMember.isPending}
          onClose={() => !removeMember.isPending && setRemoveFor(null)}
          onConfirm={async () => {
            try {
              await removeMember.mutateAsync(removeFor.id);
              toast.success(`${removeFor.principalName} removed`);
              setRemoveFor(null);
            } catch (e) {
              toast.error(friendlyError(e, "Couldn't remove member."));
            }
          }}
        />
      )}
    </div>
  );
}
