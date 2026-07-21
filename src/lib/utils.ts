import type { Email, EmailAddress, FolderId, Mailbox, Tracking } from "@/types";

export function initials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return "?";
  const namePart = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  const words = namePart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getActiveAccount(
  accounts: Mailbox[],
  activeAccountId: string
): Mailbox | undefined {
  return accounts.find((a) => a.id === activeAccountId);
}

export function getSelectedEmail(
  emails: Email[],
  selectedEmailId: string | null
): Email | undefined {
  if (!selectedEmailId) return undefined;
  return emails.find((e) => e.id === selectedEmailId);
}

/**
 * Inbox/Starred badges show unread/starred counts (cross-cutting, action-oriented);
 * Sent/Drafts/Archive/Trash badges show total item counts, matching common mail-app UX.
 */
export function getFolderCounts(
  emails: Email[],
  accountId: string
): Record<FolderId, number> {
  const accountEmails = emails.filter((e) => e.accountId === accountId);

  return {
    inbox: accountEmails.filter((e) => e.folderId === "inbox" && e.unread)
      .length,
    starred: accountEmails.filter((e) => e.starred && e.folderId !== "trash")
      .length,
    sent: accountEmails.filter((e) => e.folderId === "sent").length,
    drafts: accountEmails.filter((e) => e.folderId === "drafts").length,
    archive: accountEmails.filter((e) => e.folderId === "archive").length,
    trash: accountEmails.filter((e) => e.folderId === "trash").length,
  };
}

export function getVisibleEmails(
  emails: Email[],
  accountId: string,
  folderId: FolderId,
  searchQuery: string
): Email[] {
  const query = searchQuery.trim().toLowerCase();

  const inFolder = emails.filter((e) => {
    if (e.accountId !== accountId) return false;
    if (folderId === "starred") return e.starred && e.folderId !== "trash";
    return e.folderId === folderId;
  });

  const filtered = query
    ? inFolder.filter(
        (e) =>
          e.subject.toLowerCase().includes(query) ||
          e.from.name.toLowerCase().includes(query) ||
          e.from.email.toLowerCase().includes(query) ||
          e.previewText.toLowerCase().includes(query)
      )
    : inFolder;

  return [...filtered].sort(
    (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
  );
}

export function parseAddressList(input: string): EmailAddress[] {
  return input
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((email) => ({ name: email.split("@")[0], email }));
}

export function trackingSummary(tracking?: Tracking): string {
  if (!tracking) return "";
  const { recipients, opens, clicks } = tracking;

  const label =
    opens.length === 0
      ? "Not opened yet"
      : recipients.length <= 1
        ? "Opened"
        : `Opened by ${opens.length} of ${recipients.length}`;

  return clicks.length > 0
    ? `${label} · ${clicks.length} clicked the link`
    : label;
}
