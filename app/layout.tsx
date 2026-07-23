import type { Metadata, Viewport } from 'next';
import { GoogleAnalytics } from '@/components/google-analytics';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://dealcooker.app'),
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
    icon: [{ url: '/icon.png', type: 'image/png' }],
    shortcut: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }]
  },
  openGraph: {
    title: 'DealCooker',
    description:
      'DealCooker is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
    url: 'https://dealcooker.app',
    siteName: 'DealCooker',
    images: [
      {
        url: '/pwa-512.png',
        width: 512,
        height: 512,
        alt: 'DealCooker logo'
      }
    ],
    type: 'website'
  },
  twitter: {
    card: 'summary',
    title: 'DealCooker',
    description:
      'DealCooker is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
    images: ['/pwa-512.png']
  }
};

export const viewport: Viewport = {
  themeColor: '#121a29',
  colorScheme: 'dark light'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <GoogleAnalytics />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const host = window.location.hostname;
                  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
                  if (!isLocalhost) return;

                  const guardKey = 'dealcooker-dev-sw-cleanup:v1';
                  if (window.sessionStorage.getItem(guardKey) === 'done') return;
                  window.sessionStorage.setItem(guardKey, 'done');

                  const cleanupPromises = [];
                  if ('serviceWorker' in navigator) {
                    cleanupPromises.push(
                      navigator.serviceWorker.getRegistrations().then((registrations) =>
                        Promise.all(registrations.map((registration) => registration.unregister()))
                      )
                    );
                  }
                  if ('caches' in window) {
                    cleanupPromises.push(
                      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
                    );
                  }

                  Promise.allSettled(cleanupPromises).finally(() => {
                    window.setTimeout(() => {
                      window.location.reload();
                    }, 120);
                  });
                } catch {
                  // Ignore cleanup failures during local development bootstrap.
                }
              })();
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
