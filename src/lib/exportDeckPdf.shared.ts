export type ExportDeckPdfCard = {
  front_text: string | null;
  back_text: string | null;
};

export type ExportDeckPdfArgs = {
  title: string;
  description: string | null;
  cards: ExportDeckPdfCard[];
  emptyMessage?: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function buildDeckPdfHeaderHtml(title: string, description: string | null): string {
  const desc = (description ?? "").trim();
  return `
    <div>
      <h1 style="margin: 0 0 12px; font-size: 28px; font-weight: 700;">${escapeHtml(title || "")}</h1>
      ${desc ? `<p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(desc)}</p>` : ""}
    </div>
  `;
}

export function buildDeckPdfCardHtml(card: ExportDeckPdfCard, index: number): string {
  return `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; background: #ffffff;">
      <div style="font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 600;">${index + 1}</div>
      <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 8px; white-space: pre-wrap;">${escapeHtml(card.front_text ?? "")}</div>
      <div style="font-size: 14px; color: #374151; white-space: pre-wrap;">${escapeHtml(card.back_text ?? "")}</div>
    </div>
  `;
}

export function buildDeckPdfEmptyHtml(message: string): string {
  return `<p style="margin: 0; font-size: 15px; color: #6b7280;">${escapeHtml(message)}</p>`;
}

export function sanitizeFileName(title: string): string {
  return (title || "deck")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "deck";
}

export function buildDeckPdfHtml({ title, description, cards, emptyMessage }: ExportDeckPdfArgs): string {
  const emptyLabel = (emptyMessage ?? "Ця дошка поки що немає карток").trim();
  const cardItems = cards
    .map((card, index) => buildDeckPdfCardHtml(card, index))
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; padding: 32px; background: #ffffff;">
      ${buildDeckPdfHeaderHtml(title, description)}
      ${cards.length === 0 ? buildDeckPdfEmptyHtml(emptyLabel) : `<div>${cardItems}</div>`}
    </div>
  `;
}
