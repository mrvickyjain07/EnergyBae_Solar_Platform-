import { WorksheetModel } from "../worksheetModel";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DEFAULT_SHEET_TITLE = "Sheet1"; // title Sheets API assigns to a newly created spreadsheet's first tab

export interface CreatedSpreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetId: number;
}

async function sheetsFetch(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SHEETS_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error("Failed to create Google Spreadsheet.");
  }
  return res.json();
}

export async function createSpreadsheet(token: string, title: string): Promise<CreatedSpreadsheet> {
  const data = await sheetsFetch(token, "", {
    method: "POST",
    body: JSON.stringify({ properties: { title } }),
  });
  const sheetId = data.sheets?.[0]?.properties?.sheetId ?? 0;
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    sheetId,
  };
}

function cellToValue(cell: WorksheetModel["cells"][number]): string | number {
  if (cell.formula) return `=${cell.formula}`;
  if (cell.value === null || cell.value === undefined) return "";
  return cell.value;
}

// Converts an xlsx "wch" character-width unit to an approximate pixel width
// (Google Sheets' updateDimensionProperties expects pixelSize).
function wchToPixels(wch: number): number {
  return Math.round(wch * 7 + 5);
}

// Writes every cell value/formula in one batched values call, then renames the
// default sheet tab and applies column widths in a second batched structural call.
export async function writeWorksheetModel(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  model: WorksheetModel
): Promise<void> {
  const data = model.cells.map((cell) => ({
    range: `${DEFAULT_SHEET_TITLE}!${cell.ref}`,
    values: [[cellToValue(cell)]],
  }));

  await sheetsFetch(token, `/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });

  const dimensionRequests = model.colWidths.map((wch, index) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
      properties: { pixelSize: wchToPixels(wch) },
      fields: "pixelSize",
    },
  }));

  await sheetsFetch(token, `/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, title: model.sheetTitle },
            fields: "title",
          },
        },
        ...dimensionRequests,
      ],
    }),
  });
}
