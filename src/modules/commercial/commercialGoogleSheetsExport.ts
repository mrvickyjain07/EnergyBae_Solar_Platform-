// Mirrors src/services/worksheetExportService.ts (Residential) but builds the
// Commercial worksheet model instead. Reuses the generic, already-shared
// Google OAuth/Sheets/Drive plumbing (none of which is Residential-specific —
// it's pure Google API infrastructure) so this never touches the Residential
// export path or risks overwriting a Residential spreadsheet: every call here
// creates a brand-new spreadsheet.
import { getAccessToken } from "../../services/googleAuthService";
import { createSpreadsheet, writeWorksheetModel } from "../../services/googleSheetsService";
import { getFolderName, moveFileToFolder } from "../../services/googleDriveService";
import { buildCommercialWorksheetModel, CommercialSizingInputs } from "./commercialWorksheetModel";
import { CommercialBillData } from "./types";

export type CommercialExportStage =
  | "Creating Spreadsheet..."
  | "Uploading Data..."
  | "Applying Formatting..."
  | "Moving File..."
  | "Completed";

export interface CommercialExportResult {
  url: string;
  title: string;
  folderName: string;
}

export interface CommercialExportOptions {
  data: CommercialBillData;
  sizing: CommercialSizingInputs;
  folderId: string;
  onProgress?: (stage: CommercialExportStage) => void;
}

function isNetworkError(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  return err instanceof TypeError || msg.includes("network") || msg.includes("failed to fetch");
}

async function runStep<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (err) {
    if (isNetworkError(err)) {
      await new Promise((r) => setTimeout(r, 1500));
      return step();
    }
    throw err;
  }
}

function buildSpreadsheetTitle(consumerName: string): string {
  const name = consumerName?.trim() || "Untitled Customer";
  return `${name} - Commercial Bill Analysis`;
}

export async function exportCommercialToGoogleSheets(opts: CommercialExportOptions): Promise<CommercialExportResult> {
  const { data, sizing, folderId, onProgress } = opts;
  const model = buildCommercialWorksheetModel(data, sizing);
  const title = buildSpreadsheetTitle(data.consumerName);

  onProgress?.("Creating Spreadsheet...");
  const token = await getAccessToken();
  const created = await runStep(() => createSpreadsheet(token, title));

  onProgress?.("Uploading Data...");
  await runStep(() => writeWorksheetModel(token, created.spreadsheetId, created.sheetId, model));

  onProgress?.("Applying Formatting...");

  onProgress?.("Moving File...");
  await runStep(() => moveFileToFolder(token, created.spreadsheetId, folderId));

  let folderName = "Selected folder";
  try {
    folderName = await getFolderName(token, folderId);
  } catch {
    // cosmetic only — never block reporting export success
  }

  onProgress?.("Completed");

  return { url: created.spreadsheetUrl, title, folderName };
}
