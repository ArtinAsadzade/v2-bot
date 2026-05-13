import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'V2 Bot Admin',
  description: 'Premium admin dashboard for Xray subscription commerce.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
