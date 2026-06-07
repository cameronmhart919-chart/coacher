# Coacher — project notes for Claude

Football coaching stats tracker. React + Vite, Firebase (Auth + Firestore + Storage), deployed on Vercel (auto-deploys from `main`).

## Start-of-session checklist
Before making changes, always run:
```bash
git status      # untracked/uncommitted files?
git branch -a   # branches with work not yet on main?
git log --oneline -5
```
Untracked `.jsx` files in `src/` are usually leftovers from another branch, **not** brand-new work. Check `git branch -a` and `git log --all` before building on them.

## Architecture
- **Entry:** `src/main.jsx` — routes: `/` → `FootballCoach`, `/admin` → `AdminApp`. There is **no `/tackle` route**.
- **Two portals, one chooser:** `src/football-coach.jsx` owns auth. After login it renders `PortalSelector` (the "Passing League vs Tackle" chooser). The choice is saved per-team in `localStorage` (`coacher_portal_<instanceId>`).
  - "Passing League" → the FootballCoach UI (flag/passing-league stats).
  - "Tackle" → `TackleCoach` from `src/tackle-coach.jsx`, rendered **inline** (not a route). `onSwitchPortal` clears the choice and returns to the selector.
- **Playbook:** `src/tackle-playbook.jsx` (`TacklePlaybook`, embedded in `TackleCoach`) — SVG field play designer. Elements are `{ type, points:[{x,y}] }` for route/motion/block, `{pathData}` for freehand, `{x,y}` for player. Supports draw tools, presets, undo/redo, **copy** (⌘/Ctrl+D) and horizontal **mirror** (M) across the field centre `F.x + F.w/2`.
- **Firebase:** initialised once in `football-coach.jsx` via `import.meta.env.VITE_FIREBASE_*`. Other files (e.g. tackle-coach) reuse it via `getApps()[0]` — **never call `initializeApp` again** (causes `duplicate-app`). Do not reintroduce a `firebase-config.js` that uses `process.env.REACT_APP_*` — those are undefined under Vite.

## Build / deploy
- `npm run build` (vite) to verify before pushing.
- `vercel.json` rewrites all paths to `/index.html` so client-side routes work.
- Push to `main` → Vercel production deploy. Use a branch + PR for review; Vercel posts a preview URL on the PR.
