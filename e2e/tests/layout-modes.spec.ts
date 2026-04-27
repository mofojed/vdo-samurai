import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type AppInstance } from '../fixtures/electron-app';
import {
  setupProfile,
  createSession,
  joinSession,
  waitForP2PConnection
} from '../helpers/test-setup';
import { sleep } from '../helpers/wait-helpers';
import { selectors } from '../helpers/selectors';

async function getLayoutMode(page: AppInstance['page']) {
  return await page.evaluate(() => {
    const store = (
      window as unknown as {
        useSessionStore?: { getState: () => { layoutMode: string } };
      }
    ).useSessionStore;
    return store?.getState().layoutMode;
  });
}

test.describe('VDO Samurai E2E - Layout Modes', () => {
  let host: AppInstance;
  let participant: AppInstance;

  test.afterEach(async () => {
    if (participant) await closeApp(participant);
    if (host) await closeApp(host);
  });

  test('host can switch layout modes; participants follow', async () => {
    host = await launchApp('host');
    participant = await launchApp('participant');

    await setupProfile(host.page, 'Host User', 'Host Full Name');
    await setupProfile(participant.page, 'Participant', 'Participant Full Name');

    const sessionId = await createSession(host.page);
    await joinSession(participant.page, sessionId);
    await waitForP2PConnection(host.page, participant.page);

    // Picker is host-only
    await expect(host.page.locator(selectors.session.layoutPicker)).toBeVisible();
    await expect(participant.page.locator(selectors.session.layoutPicker)).toHaveCount(0);

    // Default is spotlight
    expect(await getLayoutMode(host.page)).toBe('spotlight');
    expect(await getLayoutMode(participant.page)).toBe('spotlight');

    // Switch to grid
    await host.page.click(selectors.session.layoutGrid);
    await sleep(2000);
    expect(await getLayoutMode(host.page)).toBe('grid');
    expect(await getLayoutMode(participant.page)).toBe('grid');

    // Grid renders multiple tiles in MainDisplay region; bottom TileGrid is hidden
    const hostMainGrid = host.page.locator(
      '[role="region"][aria-label*="Grid layout"]'
    );
    await expect(hostMainGrid).toBeVisible();
    const gridTiles = await host.page.locator('[data-testid^="grid-tile-"]').count();
    expect(gridTiles).toBeGreaterThanOrEqual(2);

    // Switch to screen-pip
    await host.page.click(selectors.session.layoutScreenPip);
    await sleep(2000);
    expect(await getLayoutMode(host.page)).toBe('screen-pip');
    expect(await getLayoutMode(participant.page)).toBe('screen-pip');

    // Switch to spotlight
    await host.page.click(selectors.session.layoutSpotlight);
    await sleep(2000);
    expect(await getLayoutMode(host.page)).toBe('spotlight');
    expect(await getLayoutMode(participant.page)).toBe('spotlight');

    // Active button reflects state
    await expect(host.page.locator(selectors.session.layoutSpotlight)).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(host.page.locator(selectors.session.layoutGrid)).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  test('layout persists when host changes focused user', async () => {
    host = await launchApp('host');
    participant = await launchApp('participant');

    await setupProfile(host.page, 'Host User', 'Host Full Name');
    await setupProfile(participant.page, 'Participant', 'Participant Full Name');

    const sessionId = await createSession(host.page);
    await joinSession(participant.page, sessionId);
    await waitForP2PConnection(host.page, participant.page);
    await sleep(3000);

    // Set screen-pip
    await host.page.click(selectors.session.layoutScreenPip);
    await sleep(1500);
    expect(await getLayoutMode(host.page)).toBe('screen-pip');

    // Click a different user's tile (this changes focus, not layout)
    await host.page.click('[role="button"][aria-label*="Participant"]');
    await sleep(2000);

    // Layout must remain screen-pip
    expect(await getLayoutMode(host.page)).toBe('screen-pip');
    expect(await getLayoutMode(participant.page)).toBe('screen-pip');

    await expect(host.page.locator(selectors.session.layoutScreenPip)).toHaveAttribute(
      'data-active',
      'true'
    );
  });
});
