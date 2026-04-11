export default {
  content: ['./index.html', './**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#F59E0B', hover: '#D97706' },
        accent: { DEFAULT: '#6366F1', hover: '#4F46E5' },
        surface: { deep: '#090A0F', DEFAULT: '#161822', raised: '#1E2030', border: '#252840' },
      },
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
