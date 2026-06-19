import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import type { ExportDeckPdfArgs } from "./exportDeckPdf.shared";
import {
  buildDeckPdfCardHtml,
  buildDeckPdfEmptyHtml,
  buildDeckPdfHeaderHtml,
  sanitizeFileName,
} from "./exportDeckPdf.shared";

const PAGE_MARGIN = 32;
const BLOCK_GAP = 10;
const RENDER_WIDTH = 720;
const CANVAS_SCALE = 1;
const JPEG_QUALITY = 0.82;

const FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif';

async function renderHtmlToCanvas(html: string): Promise<HTMLCanvasElement> {
  const node = document.createElement("div");
  node.style.position = "fixed";
  node.style.left = "-99999px";
  node.style.top = "0";
  node.style.width = `${RENDER_WIDTH}px`;
  node.style.background = "#ffffff";
  node.style.color = "#111827";
  node.style.fontFamily = FONT_FAMILY;
  node.innerHTML = html;
  document.body.appendChild(node);
  try {
    return await html2canvas(node, {
      scale: CANVAS_SCALE,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
  } finally {
    node.remove();
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

type PageLayout = {
  pageWidth: number;
  pageHeight: number;
  usableWidth: number;
  usableHeight: number;
};

function getPageLayout(pdf: jsPDF): PageLayout {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  return {
    pageWidth,
    pageHeight,
    usableWidth: pageWidth - PAGE_MARGIN * 2,
    usableHeight: pageHeight - PAGE_MARGIN * 2,
  };
}

/** Slice a block that is taller than one page (rare — very long card text). */
function appendTallCanvasToPdf(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  startY: number,
): number {
  const { pageHeight, usableWidth, usableHeight } = getPageLayout(pdf);
  const imgWidth = usableWidth;
  const pxPerPage = Math.max(1, Math.floor((usableHeight * canvas.width) / imgWidth));

  let sourceY = 0;
  let cursorY = startY;
  let sliceIndex = 0;

  while (sourceY < canvas.height) {
    const sliceHeightPx = Math.min(pxPerPage, canvas.height - sourceY);
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) break;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeightPx,
      0,
      0,
      canvas.width,
      sliceHeightPx,
    );

    const sliceImgHeight = (sliceHeightPx * imgWidth) / canvas.width;
    if (sliceIndex > 0 || (cursorY > PAGE_MARGIN && cursorY + sliceImgHeight > pageHeight - PAGE_MARGIN)) {
      pdf.addPage();
      cursorY = PAGE_MARGIN;
    }

    pdf.addImage(
      canvasToJpeg(sliceCanvas),
      "JPEG",
      PAGE_MARGIN,
      cursorY,
      imgWidth,
      sliceImgHeight,
      undefined,
      "FAST",
    );

    sourceY += sliceHeightPx;
    cursorY += sliceImgHeight;
    sliceIndex += 1;
    if (sourceY < canvas.height) {
      pdf.addPage();
      cursorY = PAGE_MARGIN;
    }
  }

  return cursorY + BLOCK_GAP;
}

/** Place one rendered block; never split across pages unless taller than a full page. */
function placeBlock(pdf: jsPDF, canvas: HTMLCanvasElement, cursorY: number): number {
  const { pageHeight, usableWidth, usableHeight } = getPageLayout(pdf);
  const imgWidth = usableWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight > usableHeight) {
    if (cursorY > PAGE_MARGIN) {
      pdf.addPage();
      cursorY = PAGE_MARGIN;
    }
    return appendTallCanvasToPdf(pdf, canvas, cursorY);
  }

  if (cursorY + imgHeight > pageHeight - PAGE_MARGIN && cursorY > PAGE_MARGIN) {
    pdf.addPage();
    cursorY = PAGE_MARGIN;
  }

  pdf.addImage(
    canvasToJpeg(canvas),
    "JPEG",
    PAGE_MARGIN,
    cursorY,
    imgWidth,
    imgHeight,
    undefined,
    "FAST",
  );

  return cursorY + imgHeight + BLOCK_GAP;
}

export async function exportDeckPdf(args: ExportDeckPdfArgs): Promise<void> {
  const fileName = sanitizeFileName(args.title);
  const emptyMessage = (args.emptyMessage ?? "Ця дошка поки що немає карток").trim();

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  let cursorY = PAGE_MARGIN;

  const headerCanvas = await renderHtmlToCanvas(
    buildDeckPdfHeaderHtml(args.title, args.description),
  );
  cursorY = placeBlock(pdf, headerCanvas, cursorY);
  cursorY += 6;

  if (args.cards.length === 0) {
    const emptyCanvas = await renderHtmlToCanvas(buildDeckPdfEmptyHtml(emptyMessage));
    placeBlock(pdf, emptyCanvas, cursorY);
    pdf.save(`${fileName}.pdf`);
    return;
  }

  for (let i = 0; i < args.cards.length; i++) {
    const cardCanvas = await renderHtmlToCanvas(buildDeckPdfCardHtml(args.cards[i], i));
    cursorY = placeBlock(pdf, cardCanvas, cursorY);
  }

  pdf.save(`${fileName}.pdf`);
}
