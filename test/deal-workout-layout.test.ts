import fs from 'node:fs';
import path from 'node:path';

import postcss, { type Declaration } from 'postcss';
import { describe, expect, it } from 'vitest';

const readStylesheet = () => fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');

const getDeclarations = (selector: string) => {
  const root = postcss.parse(readStylesheet());
  const declarations: Declaration[] = [];

  root.walkAtRules('media', (media) => {
    if (!media.params.includes('min-width: 1280px')) return;

    media.walkRules((rule) => {
      if (rule.selector.includes(selector)) {
        rule.walkDecls((declaration) => declarations.push(declaration));
      }
    });
  });

  return declarations;
};

const getSelectorDeclarations = (selector: string) => {
  const root = postcss.parse(readStylesheet());
  const declarations: Declaration[] = [];

  root.walkRules((rule) => {
    if (rule.selector === selector) {
      rule.walkDecls((declaration) => declarations.push(declaration));
    }
  });

  return declarations;
};

describe('deal workout layout', () => {
  it('lets the desktop outcome row grow when workout recommendations need more room', () => {
    const declarations = getDeclarations('.desktop-outcome-actions > *');
    const properties = declarations.map(({ prop, value }) => `${prop}:${value}`);

    expect(properties).toContain('min-height:100%');
    expect(properties).toContain('height:auto');
    expect(properties).toContain('max-height:none');
    expect(properties).not.toContain('height:var(--desktop-outcome-height)');
    expect(properties).not.toContain('max-height:var(--desktop-outcome-height)');
  });

  it('keeps a 13.5rem minimum across every desktop breakpoint', () => {
    const root = postcss.parse(readStylesheet());
    const values: string[] = [];

    root.walkDecls('--desktop-outcome-height', (declaration) => {
      values.push(declaration.value);
    });

    expect(values).toEqual(['13.5rem']);
  });

  it('keeps the embedded Quick scan inside the Build card', () => {
    const declarations = getSelectorDeclarations('.quick-scan-inline');
    const transforms = declarations.filter(({ prop }) => prop === 'transform').map(({ value }) => value);
    const directionalMargins = declarations
      .filter(({ prop }) => ['margin-top', 'margin-bottom', 'margin-left'].includes(prop))
      .map(({ value }) => value);

    expect(transforms).toEqual(['none', 'none']);
    expect(directionalMargins.some((value) => value.startsWith('-'))).toBe(false);
  });
});
