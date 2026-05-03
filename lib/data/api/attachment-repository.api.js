import "server-only";
import { opFetch, opFetchMultipart } from "@/lib/openproject/client";
import { elementsOf, mapAttachment } from "@/lib/openproject/mappers";
import { nativeId } from "@/lib/openproject/route-utils";

export async function list(_ctx, { workPackageId } = {}) {
  if (!workPackageId) throw new Error("workPackageId is required");
  const hal = await opFetch(
    `/work_packages/${nativeId(workPackageId)}/attachments`,
  );
  return elementsOf(hal).map(mapAttachment);
}

// Upload still goes via API (multipart) — file bytes have to leave Opira's
// process to OP one way or another, and OP runs its own AV / virus scan.
export async function create(_ctx, { workPackageId, formData }) {
  if (!workPackageId) throw new Error("workPackageId is required");
  const a = await opFetchMultipart(
    `/work_packages/${nativeId(workPackageId)}/attachments`,
    formData,
  );
  return mapAttachment(a);
}
