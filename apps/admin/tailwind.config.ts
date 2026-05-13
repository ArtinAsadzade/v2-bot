import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'rgba(255,255,255,0.12)',
        background: '#070A13',
        foreground: '#F8FAFC',
      },
      boxShadow: {
        glow: '0 0 80px rgba(99, 102, 241, 0.22)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
