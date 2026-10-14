import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { NotFoundError } from "@/lib/db/types";
import { buildReport, REPORT_SECTIONS } from "@/lib/report/model";
import { reportInput } from "@/lib/report/input";
import { renderPdf, renderXlsx, toCsv } from "@/lib/report/render";

const CSV_TABLES = ["causes", "fmea", "capa", "evidence", "measurements", "timeline", "controlPlan"] as const;

/** GET /api/investigations/:id/export?format=pdf|xlsx|csv&sections=a,b&table=capa */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(s.role, "report.export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "pdf";
  const sectionsParam = req.nextUrl.searchParams.get("sections");
  const sections = sectionsParam ? sectionsParam.split(",").filter((k) => REPORT_SECTIONS.some((x) => x.key === k)) : undefined;
  let input;
  try {
    input = await reportInput(s, id);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }
  const num = input.investigation.number;
  const headers = (type: string, ext: string) => ({ "Content-Type": type, "Content-Disposition": `attachment; filename="${num}-rca.${ext}"`, "Cache-Control": "no-store" });
  if (format === "csv") {
    const table = req.nextUrl.searchParams.get("table") as (typeof CSV_TABLES)[number];
    if (!CSV_TABLES.includes(table)) return NextResponse.json({ error: `table must be one of ${CSV_TABLES.join(", ")}` }, { status: 400 });
    const rows = input[table] as unknown as Record<string, unknown>[];
    return new NextResponse("﻿" + toCsv(rows), { headers: { ...headers("text/csv; charset=utf-8", "csv"), "Content-Disposition": `attachment; filename="${num}-${table}.csv"` } });
  }
  const report = buildReport(input, sections);
  if (format === "xlsx") return new NextResponse(await renderXlsx(report, input), { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx") });
  if (format === "pdf") return new NextResponse(renderPdf(report), { headers: headers("application/pdf", "pdf") });
  return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
}
