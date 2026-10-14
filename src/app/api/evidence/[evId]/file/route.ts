import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { Evidence } from "@/lib/types";

/** Streams an evidence attachment after verifying the record belongs to the caller's organization. */
export async function GET(_req: Request, { params }: { params: Promise<{ evId: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { evId } = await params;
  const ev = await s.db.get<Evidence>("evidence", evId);
  if (!ev || !ev.file_path || !ev.file_path.startsWith(`${s.orgId}/`)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = await s.driver.downloadFile(ev.file_path);
  if (!file) return NextResponse.json({ error: "File missing" }, { status: 404 });
  return new NextResponse(file.data, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${(ev.file_name ?? "evidence").replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
