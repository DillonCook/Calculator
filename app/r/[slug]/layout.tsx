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
        url: '/icon.png',
        width: 1024,
        height: 977,
        alt: 'DealCooker logo'
      }
    ],
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DealCooker Report',
    description: reportPreviewDescription,
    images: ['/icon.png']
  }
};

export default function ReportShareLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
