export type ProviderId = "outlook" | "gmail" | "hotmail" | "icloud";

export interface Tracking {
  recipients: string[];
  opens: string[];
  clicks: string[];
}

export type FolderId =
  | "inbox"
  | "starred"
  | "sent"
  | "drafts"
  | "archive"
  | "trash";

export interface Folder {
  id: FolderId;
  label: string;
}

export interface Mailbox {
  id: string;
  email: string;
  provider: ProviderId;
  isDefault?: boolean;
  sendPin?: string | null;
  lockPin?: string | null;
  locked?: boolean;
  backfillComplete?: boolean;
}

export interface User {
  id: string;
  name: string;
  loginEmail: string;
}

export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailCta {
  label: string;
  href?: string;
}

export interface Email {
  id: string;
  accountId: string;
  folderId: FolderId;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  bodyParagraphs: string[];
  bodyHtml: string;
  bodyText: string;
  previewText: string;
  timestamp: string;
  sortDate: string;
  unread: boolean;
  starred: boolean;
  cta?: EmailCta;
  tracking?: Tracking;
}
