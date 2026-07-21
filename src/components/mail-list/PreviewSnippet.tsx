interface PreviewSnippetProps {
  text: string;
}

export function PreviewSnippet({ text }: PreviewSnippetProps) {
  return <p className="truncate text-[12.5px] text-ink-meta">{text}</p>;
}
