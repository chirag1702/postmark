import type { Folder, ProviderId } from "@/types";

export const FOLDERS: Folder[] = [
  { id: "inbox", label: "Inbox" },
  { id: "starred", label: "Starred" },
  { id: "sent", label: "Sent" },
  { id: "drafts", label: "Drafts" },
  { id: "archive", label: "Archive" },
  { id: "trash", label: "Trash" },
];

export const CONNECTABLE_PROVIDERS: { id: ProviderId; label: string; mark: string }[] = [
  { id: "gmail", label: "Gmail", mark: "G" },
  { id: "outlook", label: "Outlook", mark: "O" },
  { id: "hotmail", label: "Hotmail", mark: "H" },
  { id: "icloud", label: "iCloud", mark: "i" },
];
