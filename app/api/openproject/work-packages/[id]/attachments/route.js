import { errorResponse } from "@/lib/openproject/route-utils";
import { getRepositories } from "@/lib/data/factory";
import { buildAuthzContext } from "@/lib/data/authz/context";

export const dynamic = "force-dynamic";

export async function GET(_req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const ctx = await buildAuthzContext();
    const { attachments: repo } = getRepositories();
    const result = await repo.list(ctx, { workPackageId: id });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req, ctxArg) {
  try {
    const { id } = await ctxArg.params;
    const incoming = await req.formData();
    const file = incoming.get("file");
    const description = incoming.get("description") || "";
    if (!file || typeof file === "string") {
      return Response.json({ error: "Missing file" }, { status: 400 });
    }
    const fileName = String(incoming.get("fileName") || file.name || "upload");
    const metadata = {
      fileName,
      description: description ? { raw: String(description) } : undefined,
    };
    // Re-buffer the file (see prior route comment for the why).
    const fileBuf = await file.arrayBuffer();
    const fileBlob = new Blob([fileBuf], {
      type: file.type || "application/octet-stream",
    });
    const fd = new FormData();
    fd.append("metadata", JSON.stringify(metadata));
    fd.append("file", fileBlob, fileName);

    const ctx = await buildAuthzContext();
    const { attachments: repo } = getRepositories();
    const created = await repo.create(ctx, { workPackageId: id, formData: fd });
    return Response.json(created);
  } catch (e) {
    return errorResponse(e);
  }
}
