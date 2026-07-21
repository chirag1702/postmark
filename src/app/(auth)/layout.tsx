export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-auth-gradient-from),var(--color-auth-gradient-to))] px-4">
      {children}
    </div>
  );
}
