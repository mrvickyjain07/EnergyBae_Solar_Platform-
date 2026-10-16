// Proposal Maker — Word export of the *edited* proposal document.
// Serializes the live, edited DOM node to a Word-compatible HTML blob
// (`application/msword`, .doc) so it opens — and stays editable — in Word.
// This is the only way to capture arbitrary inline edits; the JSZip/docx
// template pipeline in exportDocx.ts can't (see its own comments), so that
// one stays the "standard, unedited" one-click export.
import { saveAs } from "file-saver";

export function exportProposalWord(node: HTMLElement, filename: string) {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".no-print").forEach((el) => el.remove());
  clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${filename}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #333; padding: 4px 8px; vertical-align: top; }
  img { max-width: 100%; }
  h1, h2, h3 { color: #1B75BC; }
  .eb-page { page-break-after: always; padding: 12mm; }
  .eb-section-title { color: #1B75BC; font-weight: bold; margin-top: 16px; }
</style>
</head>
<body>${clone.outerHTML}</body>
</html>`;

  const blob = new Blob(["﻿", html], { type: "application/msword" });
  saveAs(blob, filename);
}
