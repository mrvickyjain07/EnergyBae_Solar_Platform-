// POST /api/commercial/export — Commercial bill Excel workbook generation
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as xlsx from "xlsx";
import { buildCommercialWorksheetModel } from "../../src/modules/commercial/commercialWorksheetModel";
import type { CommercialBillData } from "../../src/modules/commercial/types";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { data, panelWatt, sunHours, buffer, systemCost } = req.body;

  if (!data) {
    return res.status(400).json({ error: "Missing commercial bill data for worksheet generation." });
  }

  try {
    const wb = xlsx.utils.book_new();
    const ws: any = {};

    const model = buildCommercialWorksheetModel(data as CommercialBillData, {
      panelWatt: Number(panelWatt) || 600,
      sunHours: Number(sunHours) || 1400,
      buffer: Number(buffer) || 1.1,
      systemCost: Number(systemCost) || 0,
    });

    let maxRow = 1;
    for (const cell of model.cells) {
      const rowNum = Number(cell.ref.match(/\d+/)?.[0] || 1);
      if (rowNum > maxRow) maxRow = rowNum;
      if (typeof cell.value === "number") {
        ws[cell.ref] = { t: "n", v: cell.value };
      } else if (cell.value === null || cell.value === undefined) {
        ws[cell.ref] = { t: "s", v: "" };
      } else {
        ws[cell.ref] = { t: "s", v: String(cell.value) };
      }
    }

    ws["!ref"] = `A1:F${maxRow}`;
    ws["!cols"] = model.colWidths.map((wch) => ({ wch }));
    xlsx.utils.book_append_sheet(wb, ws, model.sheetTitle);

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    const consumerNo = (data as CommercialBillData).consumerNo || "Untitled";

    res.setHeader("Content-Disposition", `attachment; filename="Commercial_Bill_Analysis_${consumerNo}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.status(200).send(buf);

  } catch (error: any) {
    console.error("[EnergyBae][Commercial] Excel generation error:", error);
    return res.status(500).json({ error: "Failed to assemble commercial XLSX workbook file." });
  }
}
