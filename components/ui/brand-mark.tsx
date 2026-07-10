type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="dealcooker-mark-gradient" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffb45f" />
          <stop offset="0.45" stopColor="#f47f20" />
          <stop offset="1" stopColor="#2f95ff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="#0b1424" stroke="rgba(255,255,255,0.16)" />
      <path
        d="M21.1 7.5c.8 4-1.3 5.9-3.3 8.2-1.8 2-3.3 4.2-3.3 7.3 0 4.2 2.8 7.4 6.6 7.4 4.1 0 7.4-3.1 7.4-7.8 0-3.9-2.3-7.5-6.8-10.7.2 2.7-.6 4.5-2.2 5.8.1-3.3-.6-6.5 1.6-10.2Z"
        fill="url(#dealcooker-mark-gradient)"
      />
      <path d="M11 31.5h18" stroke="#80c8ff" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
      <circle cx="14.5" cy="31.5" r="1.6" fill="#ff9b38" />
      <circle cx="25.5" cy="31.5" r="1.6" fill="#4aa8ff" />
    </svg>
  );
}
