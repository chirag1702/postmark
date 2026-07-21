interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 26 }: BrandMarkProps) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-9 bg-ink-primary"
      style={{ width: size, height: size }}
    >
      <div
        className="rounded-full bg-ink-on-dark"
        style={{ width: size * 0.32, height: size * 0.32 }}
      />
    </div>
  );
}
