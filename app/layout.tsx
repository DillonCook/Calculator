import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://dealcooker.vercel.app'),
  applicationName: 'DealCooker',
  title: 'DealCooker',
  description:
    'DealCooker is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DealCooker'
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  openGraph: {
    title: 'DealCooker',
    description:
      'DealCooker is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
    url: 'https://dealcooker.vercel.app',
    siteName: 'DealCooker',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'DealCooker real estate deal analysis dashboard'
      }
    ],
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DealCooker',
    description:
      'DealCooker is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
    images: ['/og.png']
  }
};

export const viewport: Viewport = {
  themeColor: '#121a29',
  colorScheme: 'dark light'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
