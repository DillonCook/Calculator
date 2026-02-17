import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: '#0B1220',
        panel: '#111A2B',
        accent: '#4F8DFD',
        muted: '#9BA9C2'
      },
      boxShadow: {
        soft: '0 10px 30px rgba(10, 20, 40, 0.25)'
      }
    }
  },
  plugins: []
};

export default config;
