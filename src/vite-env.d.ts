/// <reference types="vite/client" />

// Vite resolves `import banner from "./assets/foo.jpg"` to a URL string at build
// time, but tsc knows nothing about that and reported every such import as
// TS2307 "cannot find module". That was 18 of the 24 errors `npm run lint` threw,
// which is how the typecheck stopped being a usable gate — real breakage was
// indistinguishable from this permanent noise.
//
// The reference above pulls in Vite's own ambient declarations for the asset
// extensions it handles (.jpg, .png, .svg, ...), so there is nothing to
// hand-maintain here as new assets are added.
