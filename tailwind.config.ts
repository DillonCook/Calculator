import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: '#08090F',
        panel: '#122236',
        card: '#1A2E45',
        accent: '#E98F2D',
        muted: '#B2BCCB'
      },
      boxShadow: {
        soft: '0 14px 36px rgba(3, 8, 16, 0.48)'
      }
    }
  },
  plugins: []
};

export default config;
