import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';

import { metadata as rootMetadata } from '../app/layout';
import { generateMetadata as generatePrintMetadata } from '../app/print/page';
import { metadata as sharedReportMetadata } from '../app/r/[slug]/layout';

type MetadataImage = {
  url: string;
  width: number;
  height: number;
};

const expectSquareLogoPreview = (metadata: Metadata) => {
  const openGraphImage = (metadata.openGraph?.images as MetadataImage[] | undefined)?.[0];
  const twitter = metadata.twitter as { card?: string; images?: string[] } | undefined;

  expect(openGraphImage).toMatchObject({
    url: '/pwa-512.png',
    width: 512,
    height: 512
  });
  expect(twitter?.card).toBe('summary');
  expect(twitter?.images).toEqual(['/pwa-512.png']);
};

describe('DealCooker brand metadata', () => {
  it('uses the purpose-built square Apple touch icon', () => {
    const icons = rootMetadata.icons;
    const appleIcons = icons && typeof icons === 'object' && 'apple' in icons ? icons.apple : undefined;

    expect(appleIcons).toEqual([
      {
        url: '/apple-touch-icon.png',
        type: 'image/png',
        sizes: '180x180'
      }
    ]);
  });

  it('uses square logo previews for root, print, and shared report metadata', async () => {
    const printMetadata = await generatePrintMetadata({ searchParams: Promise.resolve({}) });

    expectSquareLogoPreview(rootMetadata);
    expectSquareLogoPreview(printMetadata);
    expectSquareLogoPreview(sharedReportMetadata);
  });

  it('keeps the public brand asset synchronized with Dillon\'s source logo', () => {
    const appIcon = readFileSync(join(process.cwd(), 'app', 'icon.png'));
    const publicBrandLogo = readFileSync(join(process.cwd(), 'public', 'brand', 'dealcooker-logo.png'));

    expect(publicBrandLogo.equals(appIcon)).toBe(true);
  });
});

describe('DealCooker tutorial readability', () => {
  const tourSource = readFileSync(join(process.cwd(), 'components', 'dashboard', 'onboarding-tour.tsx'), 'utf8');
  const globalStyles = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

  it('keeps the spotlight cutout free of blur', () => {
    expect(tourSource).not.toContain('backdrop-blur');
    expect(tourSource).toContain('onboarding-tour-shade-top');
    expect(tourSource).toContain('onboarding-tour-shade-bottom');
    expect(tourSource).toContain('onboarding-tour-shade-left');
    expect(tourSource).toContain('onboarding-tour-shade-right');
    expect(tourSource).toContain('onboarding-tour-highlight');
  });

  it('preserves explicit high-contrast tutorial copy in light mode', () => {
    expect(globalStyles).toContain('.theme-light .onboarding-tour-title');
    expect(globalStyles).toContain('.theme-light .onboarding-tour-body');
    expect(globalStyles).toContain('.theme-light .onboarding-tour-kicker');
    expect(globalStyles).toContain('.theme-light .onboarding-tour-skip');
    expect(globalStyles).toContain('--btn-text: #1f0b00;');
  });
});
