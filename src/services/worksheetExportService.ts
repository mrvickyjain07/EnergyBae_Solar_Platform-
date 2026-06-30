import { buildWorksheetModel, SlotDataLike } from "../worksheetModel";
import { getAccessToken } from "./googleAuthService";
import { createSpreadsheet, writeWorksheetModel } from "./googleSheetsService";
import { getFolderName, moveFileToFolder } from "./googleDriveService";

export type ExportStage =
  | "Creating Spreadsheet..."
  | "Uploading Data..."
  | "Applying Formatting..."
  | "Moving File..."
  | "Completed";

export interface ExportResult {
  url: string;
  title: string;
  folderName: string;
}

export interface ExportOptions {
  slot1Data: SlotDataLike;
  solarPanelUsed: number;
  consumerName: string;
  folderId: string;
  onProgress?: (stage: ExportStage) => void;
}

function isNetworkError(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  return err instanceof TypeError || msg.includes("network") || msg.includes("failed to fetch");
}

// Retries a single step once after a short delay on connectivity loss.
// Deliberately does NOT force a fresh consent popup on other failures —
// requestAccessToken's popup relies on a live user gesture, and by the time
// we're several awaits deep in an export flow that gesture has expired, so
// the popup gets silently blocked and the promise never resolves, hanging
// the UI. If the token truly expired, the user can just retry the export.
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
  return `${name} - Solar Calculator`;
}

export async function exportToGoogleSheets(opts: ExportOptions): Promise<ExportResult> {
  const { slot1Data, solarPanelUsed, consumerName, folderId, onProgress } = opts;
  const model = buildWorksheetModel(slot1Data, solarPanelUsed);
  const title = buildSpreadsheetTitle(consumerName);

  onProgress?.("Creating Spreadsheet...");
  const token = await getAccessToken();
  const created = await runStep(() => createSpreadsheet(token, title));

  onProgress?.("Uploading Data...");
  await runStep(() => writeWorksheetModel(token, created.spreadsheetId, created.sheetId, model));

  onProgress?.("Applying Formatting...");
  // Column widths + sheet title are applied as part of writeWorksheetModel's
  // second batched call above — this stage exists for user-facing progress only.

  onProgress?.("Moving File...");
  await runStep(() => moveFileToFolder(token, created.spreadsheetId, folderId));

  // Folder name is cosmetic (shown in the success message) — never let a
  // failure here block reporting that the export itself succeeded.
  let folderName = "Selected folder";
  try {
    folderName = await getFolderName(token, folderId);
  } catch {
    // ignore — fall back to the generic label above
  }

  onProgress?.("Completed");

  return { url: created.spreadsheetUrl, title, folderName };
}
