import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://dealcook.vercel.app'),
  title: 'DealCook',
  description:
    'DealCook is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
  openGraph: {
    title: 'DealCook',
    description:
      'DealCook is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
    url: 'https://dealcook.vercel.app',
    siteName: 'DealCook',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'DealCook real estate deal analysis dashboard'
      }
    ],
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DealCook',
    description:
      'DealCook is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
    images: ['/og.png']
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
