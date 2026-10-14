import "server-only";
import Papa from "papaparse";
import ExcelJS from "exceljs";

/** Parses an uploaded CSV or XLSX (first worksheet, header row) into plain row objects. */
export async function parseTabular(name: string, data: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = new TextDecoder().decode(data);
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    return res.data;
  }
  if (lower.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, col) => (headers[col] = String(c.value ?? "").trim()));
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const obj: Record<string, unknown> = {};
      row.eachCell((c, col) => {
        const v = c.value as unknown;
        obj[headers[col]] = v instanceof Date ? v.toISOString() : typeof v === "object" && v && "result" in v ? (v as { result: unknown }).result : v;
      });
      if (Object.keys(obj).length) rows.push(obj);
    });
    return rows;
  }
  throw new Error("Unsupported file type: upload .csv or .xlsx");
}
