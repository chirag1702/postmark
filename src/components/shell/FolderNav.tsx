"use client";

import { FOLDERS } from "@/lib/mock-data";
import { getFolderCounts } from "@/lib/utils";
import { useAppState } from "@/context/app-state-context";
import { FolderNavItem } from "./FolderNavItem";

export function FolderNav() {
  const { mail, dispatch } = useAppState();
  const counts = getFolderCounts(mail.emails, mail.activeAccountId);

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {FOLDERS.map((folder) => (
        <FolderNavItem
          key={folder.id}
          label={folder.label}
          count={counts[folder.id]}
          active={mail.activeFolderId === folder.id}
          onClick={() =>
            dispatch({ type: "SET_ACTIVE_FOLDER", folderId: folder.id })
          }
        />
      ))}
    </nav>
  );
}
