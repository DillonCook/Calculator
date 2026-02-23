'use client';

import { useId } from 'react';

interface BrandAuroraTitleProps {
  text?: string;
  className?: string;
}

export function BrandAuroraTitle({ text = 'DealCooker', className }: BrandAuroraTitleProps) {
  const id = useId().replace(/:/g, '');
  const gradientId = `brand-gradient-${id}`;
  const shimmerId = `brand-shimmer-${id}`;
  const textMaskId = `brand-mask-${id}`;
  const liquidFilterId = `brand-liquid-${id}`;
  const grainFilterId = `brand-grain-${id}`;

  return (
    <span className={`brandAuroraTitle ${className ?? ''}`.trim()} aria-label={text}>
      <span className="sr-only">{text}</span>

      <svg className="brandAuroraSvg brandAuroraSvgAnimated" viewBox="0 0 900 120" role="presentation" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0b1b3a" />
            <stop offset="32%" stopColor="#2563eb" />
            <stop offset="54%" stopColor="#7c3aed" stopOpacity="0.16" />
            <stop offset="68%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0b1b3a" />
            <animate attributeName="x1" values="0%;20%;0%" dur="14s" repeatCount="indefinite" />
            <animate attributeName="x2" values="100%;80%;100%" dur="14s" repeatCount="indefinite" />
          </linearGradient>

          <linearGradient id={shimmerId} x1="-20%" y1="0%" x2="120%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0)" />
            <stop offset="52%" stopColor="rgba(210,236,255,0.22)" />
            <stop offset="58%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          <mask id={textMaskId}>
            <rect width="100%" height="100%" fill="black" />
            <text x="0" y="86" className="brandAuroraTextGlyph" fill="white">
              {text}
            </text>
          </mask>

          <filter id={liquidFilterId} x="-20%" y="-30%" width="140%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="8" result="noise">
              <animate
                attributeName="baseFrequency"
                values="0.010 0.016;0.014 0.020;0.010 0.016"
                dur="16s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G">
              <animate attributeName="scale" values="10;16;10" dur="16s" repeatCount="indefinite" />
            </feDisplacementMap>
          </filter>

          <filter id={grainFilterId} x="-20%" y="-20%" width="140%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="grain" />
            <feColorMatrix
              in="grain"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0"
              result="grainAlpha"
            />
          </filter>
        </defs>

        <g filter={`url(#${liquidFilterId})`}>
          <text x="0" y="86" className="brandAuroraTextGlyph" fill={`url(#${gradientId})`}>
            {text}
          </text>
        </g>

        <rect x="-240" y="0" width="220" height="120" fill={`url(#${shimmerId})`} mask={`url(#${textMaskId})`} opacity="0.22">
          <animate attributeName="x" values="-240;-240;920" dur="9s" repeatCount="indefinite" />
        </rect>

        <rect width="100%" height="100%" filter={`url(#${grainFilterId})`} mask={`url(#${textMaskId})`} opacity="0.45" />
      </svg>

      <svg className="brandAuroraSvg brandAuroraSvgStatic" viewBox="0 0 900 120" role="presentation" aria-hidden="true">
        <defs>
          <linearGradient id={`${gradientId}-static`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0b1b3a" />
            <stop offset="38%" stopColor="#2563eb" />
            <stop offset="72%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0b1b3a" />
          </linearGradient>
        </defs>
        <text x="0" y="86" className="brandAuroraTextGlyph" fill={`url(#${gradientId}-static)`}>
          {text}
        </text>
      </svg>
    </span>
  );
}
