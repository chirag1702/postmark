import type { Email, EmailAddress, FolderId } from "@/types";

export const MAIL_SELECT = "*, email_recipients(*), tracking_tokens(*)";

interface EmailRecipientRow {
  kind: "to" | "cc" | "bcc";
  name: string;
  email: string;
}

interface TrackingTokenRow {
  recipient_email: string;
  opened_at: string | null;
  clicked_at: string | null;
}

export interface EmailRow {
  id: string;
  mailbox_id: string;
  provider_message_id: string | null;
  folder: FolderId;
  subject: string;
  from_name: string;
  from_email: string;
  body_html: string;
  body_text: string;
  preview_text: string;
  cta_label: string | null;
  cta_href: string | null;
  sent_at: string | null;
  created_at: string;
  unread: boolean;
  starred: boolean;
  email_recipients: EmailRecipientRow[];
  tracking_tokens: TrackingTokenRow[];
}

function byKind(recipients: EmailRecipientRow[], kind: EmailRecipientRow["kind"]): EmailAddress[] {
  return recipients.filter((r) => r.kind === kind).map((r) => ({ name: r.name, email: r.email }));
}

/** Shared DB-row -> client `Email` mapper, used by GET/POST /api/mail* so the shaping logic
 * (recipient grouping, tracking aggregation, body-paragraph derivation) lives in exactly one
 * place. */
export function shapeEmail(row: EmailRow): Email {
  const to = byKind(row.email_recipients, "to");
  const cc = byKind(row.email_recipients, "cc");
  const bcc = byKind(row.email_recipients, "bcc");

  const sortDate = row.sent_at ?? row.created_at;

  return {
    id: row.id,
    accountId: row.mailbox_id,
    folderId: row.folder,
    subject: row.subject,
    from: { name: row.from_name, email: row.from_email },
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    bodyParagraphs: row.body_text.split(/\n{2,}/).filter(Boolean),
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    previewText: row.preview_text,
    timestamp: new Date(sortDate).toLocaleString(),
    sortDate,
    unread: row.unread,
    starred: row.starred,
    cta: row.cta_label ? { label: row.cta_label, href: row.cta_href ?? undefined } : undefined,
    tracking:
      row.tracking_tokens.length > 0
        ? {
            recipients: row.tracking_tokens.map((t) => t.recipient_email),
            opens: row.tracking_tokens.filter((t) => t.opened_at).map((t) => t.recipient_email),
            clicks: row.tracking_tokens.filter((t) => t.clicked_at).map((t) => t.recipient_email),
          }
        : undefined,
  };
}
