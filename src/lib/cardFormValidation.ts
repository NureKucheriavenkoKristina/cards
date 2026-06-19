import type { CardTypeName, ClozeParts } from "@/src/lib/cardModel";
import type { CardMediaForm, CardMediaSide } from "@/src/lib/cardMedia";
import {
  hasMediaFormContent,
  hasValidMediaFormSideContent,
  isCardMediaFormUrlsValid,
} from "@/src/lib/cardMedia";

export type CardFormFields = {
  frontText: string;
  backText: string;
  notes: string;
  cloze: ClozeParts;
  mediaForm: CardMediaForm;
};

/** Text or valid media on one basic-card side (notes do not count). */
export function basicCardSideHasContent(
  text: string,
  mediaForm: CardMediaForm,
  side: CardMediaSide,
): boolean {
  return text.trim().length > 0 || hasValidMediaFormSideContent(mediaForm, side);
}

function clozeFrontSideHasContent(
  cloze: ClozeParts,
  mediaForm: CardMediaForm,
  notes: string,
): boolean {
  return (
    cloze.before.trim().length > 0 ||
    cloze.gapFront.trim().length > 0 ||
    cloze.after.trim().length > 0 ||
    notes.trim().length > 0 ||
    hasValidMediaFormSideContent(mediaForm, "front")
  );
}

function clozeBackSideHasContent(cloze: ClozeParts, mediaForm: CardMediaForm): boolean {
  return (
    cloze.hidden.trim().length > 0 || hasValidMediaFormSideContent(mediaForm, "back")
  );
}

/** Cloze needs hidden answer or sentence text before/after the gap (hint/notes/media alone are not enough). */
export function isClozeCoreContentValid(cloze: ClozeParts): boolean {
  return (
    cloze.hidden.trim().length > 0 ||
    cloze.before.trim().length > 0 ||
    cloze.after.trim().length > 0
  );
}

export function hasAnyBasicFormContent(fields: CardFormFields): boolean {
  return (
    fields.frontText.trim().length > 0 ||
    fields.backText.trim().length > 0 ||
    hasMediaFormContent(fields.mediaForm)
  );
}

export function hasAnyClozeFormContent(fields: CardFormFields): boolean {
  return (
    clozeFrontSideHasContent(fields.cloze, fields.mediaForm, fields.notes) ||
    clozeBackSideHasContent(fields.cloze, fields.mediaForm)
  );
}

export function isCardFormValid(cardType: CardTypeName, fields: CardFormFields): boolean {
  if (!isCardMediaFormUrlsValid(fields.mediaForm)) return false;

  if (cardType === "cloze") {
    return (
      isClozeCoreContentValid(fields.cloze) &&
      clozeFrontSideHasContent(fields.cloze, fields.mediaForm, fields.notes) &&
      clozeBackSideHasContent(fields.cloze, fields.mediaForm)
    );
  }

  return (
    basicCardSideHasContent(fields.frontText, fields.mediaForm, "front") &&
    basicCardSideHasContent(fields.backText, fields.mediaForm, "back")
  );
}
