import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import appRobots from '../app/robots';

const root = path.resolve(process.cwd());

describe('app indexing boundary', () => {
  it('keeps the hosted application out of search indexes', () => {
    expect(appRobots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    const layout = fs.readFileSync(path.join(root, 'app', 'layout.tsx'), 'utf8');
    const nextConfig = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8');
    expect(layout).toContain("metadataBase: new URL('https://www.dealcooker.app')");
    expect(layout).toMatch(/robots:\s*\{[\s\S]*index:\s*false[\s\S]*follow:\s*false/);
    expect(nextConfig).toContain("X-Robots-Tag', value: 'noindex, nofollow, noarchive'");
  });
});
