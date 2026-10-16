// api/index.js — the whole Express API (server.ts) as ONE Vercel serverless
// function. vercel.json rewrites every /api/* request here; Express routes on
// the original URL. _server.mjs is NOT in source control: `npm run
// build:vercel` bundles server.ts into it with esbuild (ESM, node_modules
// external) before Vercel builds this function. Pre-bundling avoids Node ESM
// rejecting the source tree's extensionless relative imports at runtime.
export { default } from "./_server.mjs";
