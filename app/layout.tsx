import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Investor Command Center',
  description: 'Mobile-first real estate investment deal analysis PWA foundation.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
