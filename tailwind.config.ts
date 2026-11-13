import type { Config } from 'tailwindcss';

// Senior-friendly defaults live here: a large base scale and generous tap
// targets. Journey-stage colors are applied via inline styles from lib/brand.ts
// (not utility classes) so Tailwind's purge never strips them.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1E2A4A',
        'navy-700': '#2A3A63',
        gold: '#E8B84B',
        traditional: '#EA7C1F',
        digital: '#2F80ED',
      },
      minHeight: { tap: '56px' },
      minWidth: { tap: '56px' },
      fontSize: {
        // Bumped one step from Tailwind defaults for older users.
        base: ['1.125rem', { lineHeight: '1.7' }],
        lg: ['1.25rem', { lineHeight: '1.7' }],
      },
    },
  },
  plugins: [],
};

export default config;
