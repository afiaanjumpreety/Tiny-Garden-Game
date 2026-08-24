# Tiny Garden 🌱

A cozy, one-screen browser game about helping a tiny potted plant reach full bloom. Catch falling water and sunlight, dodge hungry bugs, and grow through five pastel pixel-art stages as the sky shifts from day to night.

Built as a portfolio project with **TypeScript**, **PixiJS 8**, **Vite**, and plain CSS. All artwork, particles, animation, and sound are generated in code, so there are no external image or audio assets to manage.

## Play

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Controls

- Move with `←` / `→` or `A` / `D`
- Drag across the game canvas on a mouse or touchscreen
- Use the on-screen arrow buttons on mobile
- Pause with `P`, `Escape`, or the pause button

## Rules

- Water drops are worth 10 points
- Sunbeams are worth 15 points
- Bugs remove one health leaf
- Every three missed resources wilts one health leaf
- Reach 400 points to fully bloom

The pace and bug frequency increase over time. High scores and the sound preference are saved in `localStorage`.

## Highlights

- Custom game loop, collision detection, spawning, difficulty, and state management
- Five animated pixel-art plant growth stages drawn with PixiJS primitives
- Responsive keyboard, pointer, and mobile touch input
- Procedural particles, screen shake, drifting clouds, and a day/sunset/night transition
- Web Audio API sound effects with a persistent mute control
- Pause, restart, victory, and game-over flows
- Accessible DOM menus, focus states, live status messaging, and reduced-motion support

## Scripts

```bash
npm run dev        # Start the development server
npm run typecheck  # Run strict TypeScript checks
npm run build      # Create a production build in dist/
npm run preview    # Preview the production build
```

## Project structure

```text
.
├── index.html       # DOM interface and accessible menus
├── src/
│   ├── components/
│   │   ├── background.ts  # Sky, clouds, stars, hills, and atmosphere
│   │   ├── characters.ts  # Player, falling items, and particles
│   │   └── leaderboard.ts # HUD, results, settings, and high scores
│   ├── game/
│   │   └── config.ts      # Shared types, colors, stages, and helpers
│   ├── main.ts      # Game state, input, audio, and orchestration
│   └── style.css    # Responsive UI and presentation
├── package.json
└── tsconfig.json
```
