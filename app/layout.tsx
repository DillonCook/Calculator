import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DealCook',
  description:
    'DealCook is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
  openGraph: {
    title: 'DealCook',
    description:
      'DealCook is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
    url: 'https://dealcook.vercel.app',
    siteName: 'DealCook',
    type: 'website'
  },
  twitter: {
    card: 'summary',
    title: 'DealCook',
    description:
      'DealCook is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
