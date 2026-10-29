import "@morphscreen/web/morphscreen.css";

export const metadata = { title: "MorphScreen with Next.js" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
