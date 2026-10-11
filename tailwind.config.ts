import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        concrete: '#E8EAEC',
        ballpoint: '#1F2FD0',
        tyvek: '#FFFFFF',
        'flag-lime': '#C8F03C',
        'flag-pink': '#FF3D81',
        'tape-black': '#000000',
      },
      borderRadius: {
        button: '14px',
        photo: '2px',
      },
      fontFamily: {
        display: ['var(--font-bricolage)', 'sans-serif'],
        serif: ['var(--font-literata)', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
