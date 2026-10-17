// Tailwind CSS through PostCSS, as documented for Next.js.
// The create-next-app template used the @tailwindcss/turbopack loader instead; with it,
// every page in `next dev` reloaded itself in an endless HMR loop (hundreds of reloads
// in a few seconds, found by the E2E tests). After switching, delete .next/dev once:
// the persistent dev cache otherwise keeps the old behavior.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
