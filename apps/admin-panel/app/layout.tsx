import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'V2 Bot Admin Panel',
  description: 'Operational admin foundation for the V2 Bot platform.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body>{children}</body>
    </html>
  );
}
