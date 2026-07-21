import { Button } from "@/components/ui/Button";
import type { Email } from "@/types";
import { EmailToolbar } from "./EmailToolbar";
import { SenderRow } from "./SenderRow";
import { TrackingStatus } from "./TrackingStatus";

interface EmailDetailProps {
  email: Email;
}

export function EmailDetail({ email }: EmailDetailProps) {
  const recipients = email.to.map((r) => r.name || r.email).join(", ");
  const cc = email.cc?.map((c) => c.name || c.email).join(", ");

  return (
    <div className="flex flex-1 flex-col overflow-y-auto animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-hairline-row px-7 pb-5 pt-6">
        <h2 className="min-w-[200px] flex-1 text-[22px] font-semibold tracking-heading text-ink-primary">
          {email.subject}
        </h2>
        <EmailToolbar email={email} />
      </div>
      <div className="flex flex-col gap-4 px-7 py-6">
        <SenderRow from={email.from} />
        <p className="text-[12.5px] text-ink-meta">
          To: {recipients}
          {cc ? ` · Cc: ${cc}` : ""}
        </p>
        {email.tracking && <TrackingStatus tracking={email.tracking} />}
        <div
          className="flex flex-col gap-3 pt-2 text-[14.5px] leading-relaxed text-ink-body [&_a]:text-ink-primary [&_a]:underline [&_img]:max-w-full"
          // body_html is sanitized server-side at sync time (src/lib/sync/sanitize-html.ts) --
          // never re-sanitized here.
          dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
        />
        {email.cta && (
          <Button size="sm" className="mt-2 w-fit">
            {email.cta.label}
          </Button>
        )}
      </div>
    </div>
  );
}
