import { MailListPane } from "@/components/mail-list/MailListPane";
import { ReadingPane } from "@/components/reading-pane/ReadingPane";

export default function MailPage() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <MailListPane />
      <ReadingPane />
    </div>
  );
}
