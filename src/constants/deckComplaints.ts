export const DECK_COMPLAINT_ISSUE_KEYS = [
  'spam_scam',
  'hate_harassment',
  'sexual_violence',
  'copyright',
  'misleading',
  'other',
] as const;

export type DeckComplaintIssueKey = (typeof DECK_COMPLAINT_ISSUE_KEYS)[number];

/** i18n keys in translations.ts (`complaintIssue*`). */
export const COMPLAINT_ISSUE_LABEL_KEYS: Record<DeckComplaintIssueKey, string> = {
  spam_scam: 'complaintIssueSpamScam',
  hate_harassment: 'complaintIssueHateHarassment',
  sexual_violence: 'complaintIssueSexualViolence',
  copyright: 'complaintIssueCopyright',
  misleading: 'complaintIssueMisleading',
  other: 'complaintIssueOther',
};

export function getComplaintIssueLabelKey(issueKey: string): string {
  if ((DECK_COMPLAINT_ISSUE_KEYS as readonly string[]).includes(issueKey)) {
    return COMPLAINT_ISSUE_LABEL_KEYS[issueKey as DeckComplaintIssueKey];
  }
  return COMPLAINT_ISSUE_LABEL_KEYS.other;
}
