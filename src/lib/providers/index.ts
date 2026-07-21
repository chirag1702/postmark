import { gmailAdapter } from "./gmail-adapter";
import { microsoftAdapter } from "./microsoft-adapter";
import type { ProviderAdapter } from "./types";

export type SupportedMailProvider = "gmail" | "outlook";

const adapters: Record<SupportedMailProvider, ProviderAdapter> = {
  gmail: gmailAdapter,
  outlook: microsoftAdapter,
};

export function getProviderAdapter(provider: string): ProviderAdapter {
  const adapter = adapters[provider as SupportedMailProvider];
  if (!adapter) {
    throw new Error(`No provider adapter registered for "${provider}"`);
  }
  return adapter;
}

export type {
  ProviderAdapter,
  SyncableFolderId,
  SendMailParams,
  SendMailResult,
  FetchMessagesParams,
  FetchMessagesResult,
  FetchMessageBodyParams,
  FetchMessageBodyResult,
  ApplyFlagsParams,
  MoveToFolderParams,
} from "./types";
export { ProviderMethodNotImplementedError } from "./types";
