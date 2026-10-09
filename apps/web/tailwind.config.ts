import type { Config } from 'tailwindcss';
import uiPreset from '../../packages/ui/tailwind-preset';

const config: Config = {
  presets: [uiPreset],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
