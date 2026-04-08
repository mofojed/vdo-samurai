# VDO Samurai - Bug Fix & Feature Completion Loop

You are working on VDO Samurai, a P2P desktop screen sharing and recording app (Electron + React + TypeScript). Your job is to find and fix one bug or complete one incomplete feature per iteration, then verify the fix.

## Step 1: Diagnose

Run these checks and scan for issues:

```bash
npm run tsc 2>&1          # TypeScript errors
npm run lint 2>&1         # ESLint errors
npm run format:check 2>&1 # Formatting issues
```

Also check for:
- TODO, FIXME, HACK, XXX, BROKEN, TEMP comments in `src/` and `electron/`
- Console warnings/errors visible in recent test output
- Incomplete features by comparing `plan/CHECKLIST.md` and `plan/profile-subtitle-feature.md` against the actual codebase (e.g., missing files, stubbed functions, half-wired UI)
- Uncommitted changes (`git diff --stat`) that may contain in-progress work with bugs
- E2E test files that reference selectors or behaviors not yet implemented

Prioritize issues in this order:
1. TypeScript compilation errors (app won't build)
2. ESLint errors (code quality gates fail)
3. Formatting violations (CI will reject)
4. Runtime bugs visible in code review (null derefs, race conditions, missing error handling at system boundaries, broken P2P message flows)
5. Incomplete features from the plan docs that are partially started but not finished
6. Stale/dead code from refactors (unused imports, orphaned files, deleted features still referenced)

## Step 2: Fix

Pick the single highest-priority issue found in Step 1 and fix it. Follow these rules:

- Read every file you plan to edit before editing it
- Keep fixes minimal and focused - fix one thing at a time
- Respect existing patterns: Zustand stores, functional components with hooks, service layer separation, HashRouter, Trystero 12-byte action name limit
- Do NOT add extra features, refactor surrounding code, or add comments/docstrings beyond the fix
- Do NOT create new files unless the fix absolutely requires it
- If the fix involves P2P messages, verify action names are <= 12 bytes
- If the fix involves types, ensure `src/types/index.ts`, `src/types/messages.ts`, and `src/types/electron.d.ts` stay consistent
- Run `npm run format` after editing to auto-fix formatting

## Step 3: Verify

After the fix, re-run the check that originally caught the issue:

```bash
npm run tsc 2>&1          # Must pass
npm run lint 2>&1         # Must pass
npm run format:check 2>&1 # Must pass
```

If the fix was behavioral (not just a type/lint error), also run the relevant E2E test if one exists:

```bash
npm run test:e2e:headless -- --grep "relevant test name" 2>&1
```

## Step 4: Report

State clearly:
- What issue was found (file, line, nature of bug)
- What was done to fix it
- Whether verification passed or failed
- What the next highest-priority issue is (so the next iteration can pick it up)

If ALL checks pass clean (zero TypeScript errors, zero lint errors, formatting clean, no TODO/FIXME in src/) and no incomplete features remain from the plans, report: **ALL CLEAR - no issues found.**

## Key Architecture Reminders

- Trystero action names: max 12 bytes (e.g., `'sd-status'` not `'speed-dial-status'`)
- Peer interface has: `stream`, `screenStream`, `speedDialStream`, `isPlayingSpeedDial`
- Session store has: `localStream`, `localScreenStream`, `localSpeedDialStream`
- Speed Dial uses dedicated P2P functions: `addSpeedDialStream`, `removeSpeedDialStream`, `broadcastSpeedDialStatus`
- Display priority in MainDisplay: speedDialStream > screenStream > stream
- E2E tests need `npm run build` before running; use `npm run test:e2e:headless`
- FFmpeg paths are in `electron/main/ffmpeg-paths.ts`
- Dev mode loads from localhost:5173, production loads built renderer
