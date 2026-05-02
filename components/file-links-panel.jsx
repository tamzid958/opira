"use client";

import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { Icon } from "@/components/icons";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useRemoveFileLink, useWpFileLinks } from "@/lib/hooks/use-openproject-detail";

export function FileLinksPanel({ wpId }) {
  const q = useWpFileLinks(wpId);
  const remove = useRemoveFileLink(wpId);

  const links = q.data || [];

  const onRemove = async (id) => {
    if (!confirm("Remove this linked file?")) return;
    try {
      await remove.mutateAsync(id);
      toast.success("Link removed");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't remove link."));
    }
  };

  if (q.isLoading) return <LoadingPill label="loading file links" />;
  if (links.length === 0) {
    return (
      <div
        className="text-[12px] text-fg-subtle py-1.5"
        title="Link a Nextcloud or OneDrive file from OpenProject's storage integration."
      >
        No linked files yet.
      </div>
    );
  }

  return (
    <ul className="grid gap-1.5">
      {links.map((l) => (
        <li
          key={l.id}
          className="grid grid-cols-[16px_minmax(0,1fr)_24px] items-center gap-2 px-2.5 py-2 rounded-md bg-surface-subtle border border-border-soft"
        >
          <Icon name="link" size={13} className="text-fg-subtle" aria-hidden="true" />
          <a
            href={l.openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-[13px] font-medium text-accent hover:underline no-underline"
            title={l.originName}
          >
            {l.originName}
            {l.storageName ? (
              <span className="text-fg-faint text-[11px] ml-1.5">({l.storageName})</span>
            ) : null}
          </a>
          {l.permissions?.delete !== false ? (
            <button
              type="button"
              aria-label="Remove link"
              onClick={() => onRemove(l.id)}
              className="grid place-items-center w-6 h-6 rounded text-fg-subtle hover:bg-surface-elevated hover:text-pri-highest cursor-pointer"
            >
              <Icon name="x" size={12} aria-hidden="true" />
            </button>
          ) : (
            <span />
          )}
        </li>
      ))}
    </ul>
  );
}
