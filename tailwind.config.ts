import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: '#050A12',
        panel: '#0B1526',
        card: '#0E1A2D',
        accent: '#3179B9',
        muted: '#9BA9C2'
      },
      boxShadow: {
        soft: '0 14px 36px rgba(3, 8, 16, 0.45)'
      }
    }
  },
  plugins: []
};

export default config;
