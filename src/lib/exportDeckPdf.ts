import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { ExportDeckPdfArgs } from "./exportDeckPdf.shared";
import { buildDeckPdfHtml, sanitizeFileName } from "./exportDeckPdf.shared";

export async function exportDeckPdf(args: ExportDeckPdfArgs): Promise<void> {
  const html = buildDeckPdfHtml(args);
  const fileName = sanitizeFileName(args.title);

  const result = await Print.printToFileAsync({ html, base64: false });
  const uri = result?.uri;
  if (!uri) {
    throw new Error("PDF export failed");
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `${fileName}.pdf`,
      UTI: ".pdf",
    });
  }
}
