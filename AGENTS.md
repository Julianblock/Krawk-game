# Agent instructions (Cursor, Claude, etc.)

KRAWK is a browser FPS: Vite 8 + TypeScript (strict) + Three.js, with an optional Express API. Read `CONTRIBUTING.md` for the full layout. These rules are the ones that break things when ignored:

1. **Keep `server/world.ts` and its imports (`server/geo/*`, `server/ai/*`, `shared/*`) browser-safe.** The GitHub Pages build runs them in the browser. Do not import `node:*`, `pngjs`, `express` or `fs` there. Guard `process` with `typeof process === "undefined"`. Node-only code belongs in `server/index.ts` and `server/db/`.
2. **Every client network call goes through `src/play/net/api.ts`,** which must keep working in both modes. Server mode uses `/api/*`. Browser mode (`import.meta.env.VITE_KRAWK_STATIC === "1"`) uses `src/play/net/local.ts`.
3. **Bump `WORLD_DATA_VERSION` in `shared/types.ts`** when you change world generation or the `WorldData` shape.
4. **Use relative asset and page paths only** (`play.html`, `shots/foo.jpg`). The site is served from a subpath.
5. **Never put secrets in `VITE_*` variables or client code.** `OPENAI_API_KEY` is read only by the server.
6. **The hero has exactly two guns:** the .45 double-stack 1911 and the .44 Colt Anaconda. Don't add weapons.
7. **Match the existing style:** small focused modules, no new frameworks, minimal comments, procedural assets (no large binary models or audio files).
8. **Before finishing:** run `npm run typecheck`. If you touched `server/` or `src/play/net/`, also run `VITE_KRAWK_STATIC=1 npm run build`. Then test in-game with `npm run dev`.
9. **Commits** are small, one idea each, in conventional style (`feat(scope): ...`, `fix(scope): ...`). Pushing to `main` deploys to production (GitHub Pages).
