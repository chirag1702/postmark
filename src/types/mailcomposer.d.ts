declare module "mailcomposer" {
  export interface MailComposerOptions {
    from?: string;
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    html?: string;
    text?: string;
    headers?: Record<string, string>;
  }

  export interface BuiltMessage {
    build(callback: (err: Error | null, message: Buffer) => void): void;
  }

  export default function mailcomposer(options: MailComposerOptions): BuiltMessage;
}
