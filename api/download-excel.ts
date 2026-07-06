// POST /api/download-excel — Residential bill Excel workbook generation
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as xlsx from "xlsx";
import { buildWorksheetModel } from "../src/worksheetModel";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { slot1Data, solarPanelUsed } = req.body;

  if (!slot1Data) {
    return res.status(400).json({ error: "Missing consumer slot data for Excel generation." });
  }

  try {
    const wb = xlsx.utils.book_new();
    const ws: any = {};
    ws["!ref"] = "A1:F31";

    const model = buildWorksheetModel(slot1Data, solarPanelUsed);

    for (const cell of model.cells) {
      if (cell.formula) {
        ws[cell.ref] = { t: "n", f: cell.formula };
        if (cell.value !== undefined && cell.value !== null) {
          ws[cell.ref].v = cell.value;
        }
      } else if (typeof cell.value === "number") {
        ws[cell.ref] = { t: "n", v: cell.value };
      } else if (cell.value === null || cell.value === undefined) {
        ws[cell.ref] = { t: "s", v: "" };
      } else {
        ws[cell.ref] = { t: "s", v: String(cell.value) };
      }
    }

    ws["!cols"] = model.colWidths.map((wch) => ({ wch }));
    xlsx.utils.book_append_sheet(wb, ws, model.sheetTitle);

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="EnergyBae_SolarSizing_Workbook.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.status(200).send(buf);
  } catch (error: any) {
    console.error("[EnergyBae] Excel generation error:", error);
    return res.status(500).json({ error: "Failed to assemble XLSX workbook." });
  }
}
