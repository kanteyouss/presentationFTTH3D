# presentationFTTH3D

Interactive 3D FTTH network deployment viz, vanilla JS + Babylon.js 6 + Vite 5.

## Commands

| Command | Action |
|---------|--------|
| `npm run dev` | Start dev server (hot-reload) |
| `npm run build` | Build to `dist/` |
| `npm run preview` | Preview production build |

No test/lint/format commands exist.

## Stack

- **3D**: Babylon.js ^6 + babylonjs-loaders ^6
- **Build**: Vite ^5 (zero‑config, no `vite.config.*`)
- **Language**: JS (ES modules, no TS, no preprocessors)
- **Style**: Plain CSS

## Entrypoints

- `index.html` — full DOM déclaratif (top bar, side panel, modaux, popups)
- `main.js` → calls `initNetwork()` which orchestrates all modules
- `src/` modules: `SceneManager`, `NetworkModel`, `CameraController`, `AnimationController`, `UIManager`, `RoadRouter`, `constants`

## Architecture

8‑step guided tour (French UI) showing FTTH planning → deployment → eligibility diagnostic.
Steps defined in `STAGES` (`constants.js:18`). Camera configs live ONLY in `CameraController.js:7` (`STAGE_CAMS`).

## Key details

- `NetworkModel.js:1000` — buildings, NRO, SROs, poles, PBOs, cables, eligibility. Largest module.
- `RoadRouter.js:267` — Dijkstra on ~20 intersection nodes, Bézier corner smoothing for cable routing.
- `CameraController.js:240` — 8 cinematic camera positions, detects user interaction to pause auto‑orbit.
- Eligibility computed in `NetworkModel` (green/red) per building based on distance to SROs and PBOs.
  Only 2 statuses: `ELIGIBLE` / `NON_ELIGIBLE` (compliant with ARCEP naming).
- Equipment images in `src/image/` (NRO.png, SRO.png, PBO.png).
- Equipment metadata in `EQUIPMENT_DATA` (`constants.js:61`) — shown in modal on click.
- `ROAD_SEGMENTS` exported from `constants.js:85` (single source of truth for all road snapping).
- No `.gitignore`, no CI, no test suite.
- `test-elig.js` is an ad‑hoc script (not part of any suite).
