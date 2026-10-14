import "server-only";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import type { buildReport } from "./model";
import type { InvestigationBundle } from "@/lib/ai/engine";

type Report = ReturnType<typeof buildReport>;

// jsPDF's built-in fonts are WinAnsi; map characters outside it so the PDF never shows garbage.
const pdfSafe = (s: string) =>
  s
    .replace(/[≈]/g, "~").replace(/[≥]/g, ">=").replace(/[≤]/g, "<=").replace(/[→]/g, "->").replace(/[←]/g, "<-").replace(/[↳]/g, "  -").replace(/[◆]/g, "*")
    .replace(/[⚠]/g, "(!)").replace(/[✓]/g, "v").replace(/[σ]/g, "sigma").replace(/[μ]/g, "mu").replace(/[Σ]/g, "Sum").replace(/[×]/g, "x")
    .replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[₂]/g, "2").replace(/[³]/g, "3").replace(/[…]/g, "...")
    .replace(/[^\x00-\xFF]/g, "?");

export function renderPdf(report: Report): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = M;
  const ensure = (h: number) => {
    if (y + h > doc.internal.pageSize.getHeight() - M) {
      doc.addPage();
      y = M;
    }
  };
  doc.setFont("helvetica", "bold").setFontSize(16).text(pdfSafe(report.title), M, y);
  y += 20;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(90).text(pdfSafe(report.subtitle), M, y);
  y += 14;
  const gen = doc.splitTextToSize(`Generated ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC by RootCause AI. Hypotheses are not confirmed findings unless marked Confirmed.`, W - 2 * M);
  doc.text(gen, M, y);
  y += gen.length * 12 + 14;
  doc.setTextColor(0);
  report.sections.forEach((sec, idx) => {
    ensure(40);
    doc.setFont("helvetica", "bold").setFontSize(12).text(pdfSafe(`${idx + 1}. ${sec.title}`), M, y);
    y += 16;
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    for (const b of sec.blocks) {
      if (b.t === "p" || b.t === "note") {
        doc.setFont("helvetica", b.t === "note" ? "italic" : "normal");
        const lines = doc.splitTextToSize(pdfSafe(b.text), W - 2 * M);
        ensure(lines.length * 12);
        doc.text(lines, M, y);
        y += lines.length * 12 + 4;
        doc.setFont("helvetica", "normal");
      } else if (b.t === "list") {
        for (const it of b.items) {
          const lines = doc.splitTextToSize(pdfSafe(`- ${it}`), W - 2 * M - 10);
          ensure(lines.length * 12);
          doc.text(lines, M + 6, y);
          y += lines.length * 12;
        }
        y += 4;
      } else {
        const head = b.t === "kv" ? [["Item", "Detail"]] : [b.head.map(pdfSafe)];
        const body = b.t === "kv" ? b.rows.map(([k, v]) => [pdfSafe(k), pdfSafe(v)]) : b.rows.map((r) => r.map(pdfSafe));
        if (b.t === "table" && b.caption) {
          ensure(20);
          doc.setFont("helvetica", "bold").text(pdfSafe(b.caption), M, y);
          doc.setFont("helvetica", "normal");
          y += 10;
        }
        autoTable(doc, {
          startY: y,
          head,
          body,
          margin: { left: M, right: M },
          styles: { fontSize: body[0] && body[0].length > 8 ? 6.5 : 8, cellPadding: 3, overflow: "linebreak" },
          headStyles: { fillColor: [29, 94, 241] },
          columnStyles: b.t === "kv" ? { 0: { cellWidth: 140, fontStyle: "bold" } } : {},
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      }
    }
    y += 8;
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8).setTextColor(120).text(`${pdfSafe(report.title)} - page ${p} of ${pages}`, M, doc.internal.pageSize.getHeight() - 20);
  }
  return doc.output("arraybuffer");
}

export async function renderXlsx(report: Report, b: InvestigationBundle): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RootCause AI";
  const summary = wb.addWorksheet("Report");
  summary.columns = [{ width: 40 }, { width: 100 }];
  summary.addRow([report.title]).font = { bold: true, size: 14 };
  summary.addRow([report.subtitle]);
  for (const s of report.sections) {
    summary.addRow([]);
    summary.addRow([s.title]).font = { bold: true, size: 12 };
    for (const bl of s.blocks) {
      if (bl.t === "p" || bl.t === "note") summary.addRow(["", bl.text]);
      else if (bl.t === "list") bl.items.forEach((it) => summary.addRow(["", it]));
      else if (bl.t === "kv") bl.rows.forEach(([k, v]) => summary.addRow([k, v]));
      else {
        if (bl.caption) summary.addRow(["", bl.caption]).font = { italic: true };
        summary.addRow(bl.head).font = { bold: true };
        bl.rows.forEach((r) => summary.addRow(r));
      }
    }
  }
  const sheet = (name: string, rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    if (!rows.length) return;
    const cols = Object.keys(rows[0]).filter((k) => !["org_id"].includes(k));
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(50, Math.max(12, c.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => ws.addRow(Object.fromEntries(cols.map((c) => [c, typeof r[c] === "object" && r[c] !== null ? JSON.stringify(r[c]) : r[c]]))));
  };
  sheet("Causes", b.causes as unknown as Record<string, unknown>[]);
  sheet("FMEA", b.fmea as unknown as Record<string, unknown>[]);
  sheet("CAPA", b.capa as unknown as Record<string, unknown>[]);
  sheet("Evidence", b.evidence as unknown as Record<string, unknown>[]);
  sheet("Measurements", b.measurements as unknown as Record<string, unknown>[]);
  sheet("Timeline", b.timeline as unknown as Record<string, unknown>[]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** RFC 4180 CSV with formula-injection protection for spreadsheet consumers. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]).filter((k) => k !== "org_id");
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}
