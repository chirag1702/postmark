"use client";

import {
  createContext,
  Dispatch,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
} from "react";
import type { Email, FolderId, Mailbox, User } from "@/types";

export interface MailState {
  accounts: Mailbox[];
  emails: Email[];
  emailsLoaded: Record<string, boolean>;
  user: User;
  activeAccountId: string;
  activeFolderId: FolderId;
  selectedEmailId: string | null;
  searchQuery: string;
}

export type MailAction =
  | { type: "SET_ACTIVE_ACCOUNT"; accountId: string }
  | { type: "SET_ACTIVE_FOLDER"; folderId: FolderId }
  | { type: "SELECT_EMAIL"; emailId: string | null }
  | { type: "SET_SEARCH"; query: string }
  | { type: "SET_EMAILS_FOR_ACCOUNT"; accountId: string; emails: Email[] }
  | { type: "UPDATE_EMAIL"; email: Email }
  | { type: "ADD_EMAIL"; email: Email }
  | { type: "ADD_ACCOUNT"; account: Mailbox }
  | { type: "SET_ACCOUNTS"; accounts: Mailbox[] }
  | { type: "UNLINK_ACCOUNT"; accountId: string }
  | { type: "SET_ACCOUNT_LOCK_PIN"; accountId: string; pin: string | null }
  | { type: "SET_ACCOUNT_SEND_PIN"; accountId: string; pin: string | null }
  | { type: "SET_ACCOUNT_LOCKED"; accountId: string; locked: boolean }
  | { type: "UPDATE_USER"; patch: Partial<User> };

function mailReducer(state: MailState, action: MailAction): MailState {
  switch (action.type) {
    case "SET_ACTIVE_ACCOUNT":
      return {
        ...state,
        activeAccountId: action.accountId,
        activeFolderId: "inbox",
        selectedEmailId: null,
        searchQuery: "",
      };
    case "SET_ACTIVE_FOLDER":
      return {
        ...state,
        activeFolderId: action.folderId,
        selectedEmailId: null,
      };
    case "SELECT_EMAIL":
      return { ...state, selectedEmailId: action.emailId };
    case "SET_SEARCH":
      return { ...state, searchQuery: action.query };
    case "SET_EMAILS_FOR_ACCOUNT": {
      const otherAccountsEmails = state.emails.filter(
        (e) => e.accountId !== action.accountId
      );
      return {
        ...state,
        emails: [...otherAccountsEmails, ...action.emails],
        emailsLoaded: { ...state.emailsLoaded, [action.accountId]: true },
      };
    }
    case "UPDATE_EMAIL": {
      const exists = state.emails.some((e) => e.id === action.email.id);
      return {
        ...state,
        emails: exists
          ? state.emails.map((e) => (e.id === action.email.id ? action.email : e))
          : [action.email, ...state.emails],
      };
    }
    case "ADD_EMAIL":
      return { ...state, emails: [action.email, ...state.emails] };
    case "ADD_ACCOUNT":
      return { ...state, accounts: [...state.accounts, action.account] };
    case "SET_ACCOUNTS": {
      const activeAccountId = action.accounts.some(
        (a) => a.id === state.activeAccountId
      )
        ? state.activeAccountId
        : (action.accounts.find((a) => a.isDefault)?.id ??
          action.accounts[0]?.id ??
          "");
      return { ...state, accounts: action.accounts, activeAccountId };
    }
    case "UNLINK_ACCOUNT": {
      const remaining = state.accounts.filter(
        (a) => a.id !== action.accountId
      );
      const activeAccountId =
        state.activeAccountId === action.accountId
          ? (remaining[0]?.id ?? "")
          : state.activeAccountId;
      return {
        ...state,
        accounts: remaining,
        activeAccountId,
        selectedEmailId: null,
      };
    }
    case "SET_ACCOUNT_LOCK_PIN":
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === action.accountId ? { ...a, lockPin: action.pin } : a
        ),
      };
    case "SET_ACCOUNT_SEND_PIN":
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === action.accountId ? { ...a, sendPin: action.pin } : a
        ),
      };
    case "SET_ACCOUNT_LOCKED":
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === action.accountId ? { ...a, locked: action.locked } : a
        ),
      };
    case "UPDATE_USER":
      return { ...state, user: { ...state.user, ...action.patch } };
    default:
      return state;
  }
}

function createInitialMailState({
  initialUser,
  initialAccounts,
}: {
  initialUser: User;
  initialAccounts: Mailbox[];
}): MailState {
  return {
    accounts: initialAccounts,
    emails: [],
    emailsLoaded: {},
    user: initialUser,
    activeAccountId:
      initialAccounts.find((a) => a.isDefault)?.id ??
      initialAccounts[0]?.id ??
      "",
    activeFolderId: "inbox",
    selectedEmailId: null,
    searchQuery: "",
  };
}

export interface ComposeDraft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  showCcBcc: boolean;
}

export const EMPTY_COMPOSE_DRAFT: ComposeDraft = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
  showCcBcc: false,
};

export type SettingsTab = "account" | "security" | "mailboxes";

export interface UiState {
  composeOpen: boolean;
  composeDraft: ComposeDraft;
  sendPinModalOpen: boolean;
  settingsOpen: boolean;
  settingsActiveTab: SettingsTab;
  accountSwitcherOpen: boolean;
  density: "comfortable" | "compact";
  showPreview: boolean;
  readReceiptDefault: boolean;
  mailboxConnectStatus: { type: "success" | "error"; message: string } | null;
}

const INITIAL_UI_STATE: UiState = {
  composeOpen: false,
  composeDraft: EMPTY_COMPOSE_DRAFT,
  sendPinModalOpen: false,
  settingsOpen: false,
  settingsActiveTab: "account",
  accountSwitcherOpen: false,
  density: "comfortable",
  showPreview: true,
  readReceiptDefault: false,
  mailboxConnectStatus: null,
};

interface AppStateContextValue {
  mail: MailState;
  dispatch: Dispatch<MailAction>;
  ui: UiState;
  setUi: (patch: Partial<UiState>) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({
  children,
  initialUser,
  initialAccounts = [],
}: {
  children: ReactNode;
  initialUser: User;
  initialAccounts?: Mailbox[];
}) {
  const [mail, dispatch] = useReducer(
    mailReducer,
    { initialUser, initialAccounts },
    createInitialMailState
  );
  const [ui, setUiState] = useState<UiState>(INITIAL_UI_STATE);

  const setUi = useCallback((patch: Partial<UiState>) => {
    setUiState((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo(
    () => ({ mail, dispatch, ui, setUi }),
    [mail, ui, setUi]
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return ctx;
}
