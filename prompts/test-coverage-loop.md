# VDO Samurai - E2E Test Coverage Expansion Loop

You are working on VDO Samurai, a P2P desktop screen sharing and recording app (Electron + React + TypeScript). Your job is to increase Playwright E2E test coverage by writing one new test (or expanding an existing test file) per iteration, covering untested features from both host and participant perspectives. Fix any bugs you discover along the way.

## Step 1: Assess Current Coverage

Scan the existing E2E tests to understand what's already covered:

```bash
ls e2e/tests/*.spec.ts
```

Read the existing test files to understand what scenarios are tested. Then compare against the full feature list below and identify the **highest-priority untested area**.

### Full Feature List (ordered by test priority)

**Host-perspective features:**
1. Create a room and verify room code is displayed
2. Profile setup (display name, full name) before session
3. Start/stop recording with countdown overlay
4. Screen sharing (open source picker, share, stop)
5. Speed dial: import clip, play clip, stop clip, volume control
6. Host transfer via right-click context menu on a peer tile
7. NLE editor: split clips, delete segments, preview playback
8. NLE editor: export with different layouts (PiP, camera-only)
9. File transfer: receive recordings from participants after stop
10. Connection history: previously joined rooms shown on home page

**Participant-perspective features:**
1. Join a room using room code
2. Profile setup before joining
3. Camera/microphone toggle during session
4. See recording countdown and ON AIR indicator (participant cannot control recording)
5. Screen sharing as participant
6. Auto-transfer recordings to host after recording stops
7. See speed dial playback from host (receive speedDialStream)
8. Receive host transfer (become new host)

**Both perspectives:**
1. Focus sync: clicking a tile focuses that user for everyone
2. Connection status indicator shows connected state
3. Multiple peers in tile grid with correct labels
4. Audio level bars respond to audio input
5. Leave session and return to home page
6. Error boundary catches and displays errors gracefully
7. Page visibility handling (tab blur/focus during recording)

**Edge cases:**
1. Join with invalid/empty room code (validation)
2. Camera toggle during active recording (stream resilience)
3. Network interruption and reconnection
4. Large file transfer with progress indication
5. Export cancellation mid-process
6. Multiple sequential recordings in same session
7. Speed dial playback during recording (timeline tracking)

## Step 2: Write the Test

Pick the single highest-priority **untested** feature from the list above. Write or extend a test following these rules:

### Test Structure
```typescript
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, AppInstance } from '../fixtures/electron-app';
import { selectors } from '../helpers/selectors';
// Import other helpers as needed from ../helpers/

test.describe('Feature Name', () => {
  let host: AppInstance;

  test.afterEach(async () => {
    if (host) await closeApp(host);
  });

  test('should do something from host perspective', async () => {
    host = await launchApp('host-instance');
    // ...
  });
});
```

### Rules
- Use selectors from `e2e/helpers/selectors.ts` — add new selectors there if needed (matching existing patterns)
- Use wait helpers from `e2e/helpers/wait-helpers.ts` — add new helpers if needed
- Use store helpers from `e2e/helpers/store-helpers.ts` for Zustand state assertions
- Use test setup helpers from `e2e/helpers/test-setup.ts` for common setup (profile, session creation)
- Each test must clean up with `closeApp()` in afterEach
- For multi-peer tests, launch separate instances with unique names
- Keep tests focused: one behavior per test case
- Add `data-testid` attributes to components if needed for reliable selection
- Test from both host AND participant perspectives where applicable
- Set reasonable timeouts (P2P connection can take up to 90s)
- Never hardcode `headless: false` — respect environment variables

### File Naming
- New test files: `e2e/tests/<feature-name>.spec.ts`
- Group related tests in one file with `test.describe()`

## Step 3: Verify

Build the app and run your new test:

```bash
npm run build 2>&1
npm run test:e2e:headless -- --grep "test name pattern" 2>&1
```

Also verify no regressions:

```bash
npm run tsc 2>&1
npm run lint 2>&1
npm run format:check 2>&1
```

### If the test fails:
1. Read the error output carefully
2. Determine if it's a **test bug** (fix the test) or an **app bug** (fix the app code)
3. If it's an app bug: fix it minimally, run `npm run format`, then re-run the test
4. If the test requires selectors that don't exist: add `data-testid` to the component, rebuild, re-run
5. Iterate until the test passes or you've identified a legitimate app issue that needs a separate fix

### If the test passes:
Run the full E2E suite to check for regressions:
```bash
npm run test:e2e:headless 2>&1
```

## Step 4: Report

State clearly:
- What feature/scenario was tested
- Which perspective (host, participant, or both)
- How many test cases were added
- Files created or modified
- Any app bugs found and fixed along the way
- Whether all tests pass (new + existing)
- What the next untested feature is (for the next iteration)

## Key Architecture Reminders

- Trystero action names: max 12 bytes (e.g., `'sd-status'` not `'speed-dial-status'`)
- Peer interface has: `stream`, `screenStream`, `speedDialStream`, `isPlayingSpeedDial`
- Session store has: `localStream`, `localScreenStream`, `localSpeedDialStream`
- Display priority in MainDisplay: speedDialStream > screenStream > stream
- E2E tests need `npm run build` before running; use `npm run test:e2e:headless`
- Mock streams: Host gets blue (camera) / purple (screen), Participant gets pink (camera) / red (screen)
- Mock streams show user name, type label, and frame counter
- Use `test-setup.ts` helpers: `setupProfile()`, `createSession()`, `joinSession()`, `waitForP2PConnection()`
- Store state can be read via `page.evaluate(() => window.__ZUSTAND_STORES__?.storeName?.getState())`
- Selectors are centralized in `e2e/helpers/selectors.ts` — always add new ones there
