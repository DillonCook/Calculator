import type { Metadata } from 'next';

const reportPreviewDescription = 'Open a shared DealCooker PDF-ready investment report with deal assumptions, strategy highlights, cash flow, ROI, IRR, DSCR, and underwriting work.';

export const metadata: Metadata = {
  title: 'DealCooker Report',
  description: reportPreviewDescription,
  openGraph: {
    title: 'DealCooker Report',
    description: reportPreviewDescription,
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
    title: 'DealCooker Report',
    description: reportPreviewDescription,
    images: ['/pwa-512.png']
  }
};

export default function ReportShareLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
