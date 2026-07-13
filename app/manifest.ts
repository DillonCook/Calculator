import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'DealCooker',
    short_name: 'DealCooker',
    description:
      'DealCooker is a powerful real estate investment calculator for rental, Airbnb, BRRRR, PadSplit, and flip deals with instant cash flow, DSCR, ROI, and IRR insights.',
    start_url: '/',
    scope: '/',
    lang: 'en-US',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#07080f',
    theme_color: '#121a29',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      {
        src: '/icon.png',
        sizes: '543x628',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/pwa-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/pwa-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/pwa-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/pwa-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ],
    screenshots: [
      {
        src: '/og.png',
        sizes: '1536x1024',
        type: 'image/png',
        form_factor: 'wide',
        label: 'DealCooker investment calculator dashboard'
      }
    ]
  };
}
