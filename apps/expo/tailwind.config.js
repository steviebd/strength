import type { Config } from 'tailwindcss';

export default {
  content: ['./**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
} satisfies Config;
