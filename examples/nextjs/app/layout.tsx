export const metadata = {
  title: "Localbase + Next.js Example",
  description: "Example of using Localbase with Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
