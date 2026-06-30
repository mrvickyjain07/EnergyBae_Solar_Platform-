import { loadScript } from "./scriptLoader";

const PICKER_SCRIPT_URL = "https://apis.google.com/js/api.js";
const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

export interface DriveFolder {
  id: string;
  name: string;
}

// Accepts a pasted Drive folder URL (or a bare folder ID) and extracts the folder ID.
export function parseFolderIdFromUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const folderPathMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderPathMatch) return folderPathMatch[1];

  const idQueryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idQueryMatch) return idQueryMatch[1];

  // Bare ID pasted directly (Drive IDs are alphanumeric/-/_ and reasonably long).
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  return null;
}

let pickerApiLoaded: Promise<void> | null = null;

async function ensurePickerLoaded(): Promise<void> {
  if (pickerApiLoaded) return pickerApiLoaded;
  pickerApiLoaded = loadScript(PICKER_SCRIPT_URL).then(
    () =>
      new Promise<void>((resolve, reject) => {
        const gapi = (window as any).gapi;
        if (!gapi) {
          reject(new Error("Unable to access selected folder."));
          return;
        }
        gapi.load("picker", { callback: () => resolve() });
      })
  );
  return pickerApiLoaded;
}

// Opens the Google Drive Picker restricted to folder selection and resolves
// with the chosen folder, or null if the user cancels.
export async function openFolderPicker(accessToken: string): Promise<DriveFolder | null> {
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Unable to access selected folder.");
  }

  await ensurePickerLoaded();
  const google = (window as any).google;

  return new Promise<DriveFolder | null>((resolve, reject) => {
    try {
      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes("application/vnd.google-apps.folder");

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            if (doc) {
              resolve({ id: doc.id, name: doc.name });
              return;
            }
          }
          if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    } catch {
      reject(new Error("Unable to access selected folder."));
    }
  });
}

// Moves a Drive file into the given folder, removing it from its current parents
// (which is the root, since Sheets API always creates new spreadsheets there).
export async function moveFileToFolder(accessToken: string, fileId: string, folderId: string): Promise<void> {
  try {
    const currentRes = await fetch(`${DRIVE_FILES_ENDPOINT}/${fileId}?fields=parents`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!currentRes.ok) throw new Error("Unable to access selected folder.");
    const current = await currentRes.json();
    const previousParents = (current.parents || []).join(",");

    const moveRes = await fetch(
      `${DRIVE_FILES_ENDPOINT}/${fileId}?addParents=${encodeURIComponent(folderId)}&removeParents=${encodeURIComponent(previousParents)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!moveRes.ok) throw new Error("Unable to access selected folder.");
  } catch {
    throw new Error("Unable to access selected folder.");
  }
}

// Fetches a folder's display name, also serving as an access check.
export async function getFolderName(accessToken: string, folderId: string): Promise<string> {
  const res = await fetch(`${DRIVE_FILES_ENDPOINT}/${folderId}?fields=name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Unable to access selected folder.");
  const data = await res.json();
  return data.name || "Selected folder";
}
