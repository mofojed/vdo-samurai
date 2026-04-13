import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type AppInstance } from '../fixtures/electron-app';
import { selectors } from '../helpers/selectors';
import {
  setupProfile,
  createSession,
  joinSession,
  waitForP2PConnection
} from '../helpers/test-setup';
import { sleep } from '../helpers/wait-helpers';

/**
 * Wait for all pages to see the expected number of tiles (self + peers).
 * Each page should see `expectedTileCount` total tiles.
 */
async function waitForAllPeersVisible(
  pages: { page: AppInstance['page']; name: string }[],
  expectedTileCount: number,
  timeout: number = 120000
) {
  const pollInterval = 5000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const tileCounts = await Promise.all(
      pages.map(async ({ page, name }) => {
        const count = await page.locator('[role="listitem"]').count();
        return { name, count };
      })
    );

    console.log(
      `[P2P] Tile counts: ${tileCounts.map((t) => `${t.name}=${t.count}`).join(', ')} (expected ${expectedTileCount})`
    );

    const allReady = tileCounts.every((t) => t.count >= expectedTileCount);
    if (allReady) {
      console.log('[P2P] All peers visible!');
      return;
    }

    await sleep(pollInterval);
  }

  // On failure, log relay status for debugging
  for (const { page, name } of pages) {
    try {
      const relayInfo = await page.evaluate(() => {
        // Access trystero relay sockets for debugging
        const win = window as unknown as { __trysteroSelfId?: string };
        return { selfId: win.__trysteroSelfId };
      });
      console.error(`[P2P] ${name} selfId: ${relayInfo.selfId}`);
    } catch {
      // ignore
    }
  }

  throw new Error(
    `Not all peers visible after ${timeout}ms. Expected ${expectedTileCount} tiles on each page.`
  );
}

/**
 * Get the peer count from the peer store
 */
async function getPeerCount(page: AppInstance['page']): Promise<number> {
  return page.evaluate(() => {
    const store = (window as unknown as Record<string, { getState?: () => { peers?: unknown[] } }>)
      .usePeerStore;
    return store?.getState?.()?.peers?.length ?? 0;
  });
}

test.describe('Peer Visibility and Connection Reliability', () => {
  const apps: AppInstance[] = [];

  test.afterEach(async () => {
    // Clean up all app instances in reverse order
    for (const app of apps.reverse()) {
      await closeApp(app);
    }
    apps.length = 0;
  });

  test('two peers can see each other after joining the same room', async () => {
    const host = await launchApp('host');
    apps.push(host);
    const participant = await launchApp('participant');
    apps.push(participant);

    // Handle dialogs
    host.page.on('dialog', async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        /* ignore */
      }
    });
    participant.page.on('dialog', async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        /* ignore */
      }
    });

    // Setup profiles
    await setupProfile(host.page, 'HostAlice', 'Alice Full');
    await setupProfile(participant.page, 'PeerBob', 'Bob Full');

    // Host creates session
    const sessionId = await createSession(host.page);
    console.log('[E2E] Host created session:', sessionId);

    // Participant joins
    await joinSession(participant.page, sessionId);
    console.log('[E2E] Participant joined session');

    // Wait for P2P connection
    await waitForP2PConnection(host.page, participant.page);

    // Verify tiles
    const hostTile = participant.page.locator(selectors.session.peerTileByName('HostAlice'));
    await expect(hostTile).toBeVisible({ timeout: 10000 });

    const peerTile = host.page.locator(selectors.session.peerTileByName('PeerBob'));
    await expect(peerTile).toBeVisible({ timeout: 10000 });

    // Verify peer store counts
    const hostPeerCount = await getPeerCount(host.page);
    const participantPeerCount = await getPeerCount(participant.page);
    expect(hostPeerCount).toBe(1);
    expect(participantPeerCount).toBe(1);

    console.log('[E2E] Two-peer visibility test passed!');
  });

  test('three peers can all see each other', async () => {
    const host = await launchApp('host');
    apps.push(host);
    const peer1 = await launchApp('participant');
    apps.push(peer1);
    const peer2 = await launchApp('participant2');
    apps.push(peer2);

    // Handle dialogs
    for (const app of apps) {
      app.page.on('dialog', async (dialog) => {
        try {
          await dialog.accept();
        } catch {
          /* ignore */
        }
      });
    }

    // Setup profiles
    await setupProfile(host.page, 'HostAlice', 'Alice Full');
    await setupProfile(peer1.page, 'PeerBob', 'Bob Full');
    await setupProfile(peer2.page, 'PeerCharlie', 'Charlie Full');

    // Host creates session
    const sessionId = await createSession(host.page);
    console.log('[E2E] Host created session:', sessionId);

    // Peer 1 joins
    await joinSession(peer1.page, sessionId);
    console.log('[E2E] Peer 1 joined session');

    // Wait for peer 1 to connect before peer 2 joins
    await waitForP2PConnection(host.page, peer1.page);
    console.log('[E2E] Peer 1 connected to host');

    // Peer 2 joins
    await joinSession(peer2.page, sessionId);
    console.log('[E2E] Peer 2 joined session');

    // Wait for all three to see each other (3 tiles = self + 2 peers)
    await waitForAllPeersVisible(
      [
        { page: host.page, name: 'Host' },
        { page: peer1.page, name: 'Peer1' },
        { page: peer2.page, name: 'Peer2' }
      ],
      3,
      120000
    );

    // Verify specific tiles on each page
    // Host sees both peers
    await expect(host.page.locator(selectors.session.peerTileByName('PeerBob'))).toBeVisible({
      timeout: 10000
    });
    await expect(host.page.locator(selectors.session.peerTileByName('PeerCharlie'))).toBeVisible({
      timeout: 10000
    });
    console.log('[E2E] Host sees both peers');

    // Peer 1 sees host and peer 2
    await expect(peer1.page.locator(selectors.session.peerTileByName('HostAlice'))).toBeVisible({
      timeout: 10000
    });
    await expect(peer1.page.locator(selectors.session.peerTileByName('PeerCharlie'))).toBeVisible({
      timeout: 10000
    });
    console.log('[E2E] Peer 1 sees host and peer 2');

    // Peer 2 sees host and peer 1
    await expect(peer2.page.locator(selectors.session.peerTileByName('HostAlice'))).toBeVisible({
      timeout: 10000
    });
    await expect(peer2.page.locator(selectors.session.peerTileByName('PeerBob'))).toBeVisible({
      timeout: 10000
    });
    console.log('[E2E] Peer 2 sees host and peer 1');

    // Verify peer store counts (each peer should see exactly 2 others)
    const hostPeerCount = await getPeerCount(host.page);
    const peer1PeerCount = await getPeerCount(peer1.page);
    const peer2PeerCount = await getPeerCount(peer2.page);
    expect(hostPeerCount).toBe(2);
    expect(peer1PeerCount).toBe(2);
    expect(peer2PeerCount).toBe(2);

    console.log('[E2E] Three-peer visibility test passed!');
  });

  test('late joiner sees all existing peers', async () => {
    const host = await launchApp('host');
    apps.push(host);
    const earlyPeer = await launchApp('participant');
    apps.push(earlyPeer);

    // Handle dialogs
    for (const app of apps) {
      app.page.on('dialog', async (dialog) => {
        try {
          await dialog.accept();
        } catch {
          /* ignore */
        }
      });
    }

    // Setup profiles and connect first two
    await setupProfile(host.page, 'HostAlice', 'Alice Full');
    await setupProfile(earlyPeer.page, 'EarlyBob', 'Bob Full');

    const sessionId = await createSession(host.page);
    await joinSession(earlyPeer.page, sessionId);
    await waitForP2PConnection(host.page, earlyPeer.page);
    console.log('[E2E] Host and early peer connected');

    // Wait a few seconds, then launch a late joiner
    await sleep(5000);

    const latePeer = await launchApp('participant2');
    apps.push(latePeer);
    latePeer.page.on('dialog', async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        /* ignore */
      }
    });

    await setupProfile(latePeer.page, 'LateCharlie', 'Charlie Full');
    await joinSession(latePeer.page, sessionId);
    console.log('[E2E] Late peer joined session');

    // Wait for all three to see each other
    await waitForAllPeersVisible(
      [
        { page: host.page, name: 'Host' },
        { page: earlyPeer.page, name: 'EarlyPeer' },
        { page: latePeer.page, name: 'LatePeer' }
      ],
      3,
      120000
    );

    // Verify the late joiner can see both existing peers
    await expect(latePeer.page.locator(selectors.session.peerTileByName('HostAlice'))).toBeVisible({
      timeout: 10000
    });
    await expect(latePeer.page.locator(selectors.session.peerTileByName('EarlyBob'))).toBeVisible({
      timeout: 10000
    });
    console.log('[E2E] Late joiner sees all existing peers');

    // Verify existing peers see the late joiner
    await expect(host.page.locator(selectors.session.peerTileByName('LateCharlie'))).toBeVisible({
      timeout: 10000
    });
    await expect(
      earlyPeer.page.locator(selectors.session.peerTileByName('LateCharlie'))
    ).toBeVisible({ timeout: 10000 });
    console.log('[E2E] Existing peers see late joiner');

    console.log('[E2E] Late joiner test passed!');
  });

  test('peer remains visible after another peer leaves', async () => {
    const host = await launchApp('host');
    apps.push(host);
    const peer1 = await launchApp('participant');
    apps.push(peer1);
    const peer2 = await launchApp('participant2');
    apps.push(peer2);

    // Handle dialogs
    for (const app of apps) {
      app.page.on('dialog', async (dialog) => {
        try {
          await dialog.accept();
        } catch {
          /* ignore */
        }
      });
    }

    // Setup and connect all three
    await setupProfile(host.page, 'HostAlice', 'Alice Full');
    await setupProfile(peer1.page, 'PeerBob', 'Bob Full');
    await setupProfile(peer2.page, 'PeerCharlie', 'Charlie Full');

    const sessionId = await createSession(host.page);
    await joinSession(peer1.page, sessionId);
    await waitForP2PConnection(host.page, peer1.page);
    await joinSession(peer2.page, sessionId);

    // Wait for all three to see each other
    await waitForAllPeersVisible(
      [
        { page: host.page, name: 'Host' },
        { page: peer1.page, name: 'Peer1' },
        { page: peer2.page, name: 'Peer2' }
      ],
      3,
      120000
    );
    console.log('[E2E] All three peers connected');

    // Peer 1 leaves
    const leaveButton = peer1.page.locator(selectors.session.leaveButton);
    await expect(leaveButton).toBeVisible({ timeout: 5000 });
    await leaveButton.click();
    await peer1.page.waitForSelector(selectors.home.title, { timeout: 10000 });
    console.log('[E2E] Peer 1 left the session');

    // Wait for host and peer 2 to detect the departure (tile count should drop to 2)
    await waitForAllPeersVisible(
      [
        { page: host.page, name: 'Host' },
        { page: peer2.page, name: 'Peer2' }
      ],
      2,
      30000
    );

    // Verify host still sees peer 2
    await expect(host.page.locator(selectors.session.peerTileByName('PeerCharlie'))).toBeVisible({
      timeout: 10000
    });
    // Verify peer 2 still sees host
    await expect(peer2.page.locator(selectors.session.peerTileByName('HostAlice'))).toBeVisible({
      timeout: 10000
    });

    // Verify peer 1 is no longer visible
    await expect(host.page.locator(selectors.session.peerTileByName('PeerBob'))).not.toBeVisible({
      timeout: 10000
    });
    await expect(peer2.page.locator(selectors.session.peerTileByName('PeerBob'))).not.toBeVisible({
      timeout: 10000
    });

    // Verify peer counts are correct
    const hostPeerCount = await getPeerCount(host.page);
    const peer2PeerCount = await getPeerCount(peer2.page);
    expect(hostPeerCount).toBe(1);
    expect(peer2PeerCount).toBe(1);

    console.log('[E2E] Remaining peers still see each other after departure');
  });

  test('peer info (name, host status) is correctly exchanged', async () => {
    const host = await launchApp('host');
    apps.push(host);
    const participant = await launchApp('participant');
    apps.push(participant);

    // Handle dialogs
    for (const app of apps) {
      app.page.on('dialog', async (dialog) => {
        try {
          await dialog.accept();
        } catch {
          /* ignore */
        }
      });
    }

    await setupProfile(host.page, 'HostAlice', 'Alice Full');
    await setupProfile(participant.page, 'PeerBob', 'Bob Full');

    const sessionId = await createSession(host.page);
    await joinSession(participant.page, sessionId);
    await waitForP2PConnection(host.page, participant.page);
    console.log('[E2E] Connected');

    // Wait for peer info to propagate
    await sleep(3000);

    // Verify host tile shows host badge on participant's side
    const hostTileOnParticipant = participant.page.locator(selectors.session.hostTile);
    await expect(hostTileOnParticipant).toBeVisible({ timeout: 10000 });
    console.log('[E2E] Host badge visible on participant side');

    // Verify peer names in state store
    const hostPeerInfo = await host.page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState?: () => { peers?: Array<{ id: string; name: string; isHost: boolean }> } }
        >
      ).usePeerStore;
      const peers = store?.getState?.()?.peers ?? [];
      return peers.map((p) => ({ name: p.name, isHost: p.isHost }));
    });
    expect(hostPeerInfo).toHaveLength(1);
    expect(hostPeerInfo[0].name).toBe('PeerBob');
    expect(hostPeerInfo[0].isHost).toBe(false);

    const participantPeerInfo = await participant.page.evaluate(() => {
      const store = (
        window as unknown as Record<
          string,
          { getState?: () => { peers?: Array<{ id: string; name: string; isHost: boolean }> } }
        >
      ).usePeerStore;
      const peers = store?.getState?.()?.peers ?? [];
      return peers.map((p) => ({ name: p.name, isHost: p.isHost }));
    });
    expect(participantPeerInfo).toHaveLength(1);
    expect(participantPeerInfo[0].name).toBe('HostAlice');
    expect(participantPeerInfo[0].isHost).toBe(true);

    console.log('[E2E] Peer info exchange test passed!');
  });

  test('simultaneous join - both peers join at nearly the same time', async () => {
    const host = await launchApp('host');
    apps.push(host);

    // Handle dialogs
    host.page.on('dialog', async (dialog) => {
      try {
        await dialog.accept();
      } catch {
        /* ignore */
      }
    });

    // Setup host and create session
    await setupProfile(host.page, 'HostAlice', 'Alice Full');
    const sessionId = await createSession(host.page);
    console.log('[E2E] Host created session:', sessionId);

    // Launch two participants simultaneously
    const [peer1, peer2] = await Promise.all([launchApp('participant'), launchApp('participant2')]);
    apps.push(peer1);
    apps.push(peer2);

    for (const app of [peer1, peer2]) {
      app.page.on('dialog', async (dialog) => {
        try {
          await dialog.accept();
        } catch {
          /* ignore */
        }
      });
    }

    // Setup profiles
    await setupProfile(peer1.page, 'PeerBob', 'Bob Full');
    await setupProfile(peer2.page, 'PeerCharlie', 'Charlie Full');

    // Both join at nearly the same time
    await Promise.all([joinSession(peer1.page, sessionId), joinSession(peer2.page, sessionId)]);
    console.log('[E2E] Both peers joined simultaneously');

    // Wait for all three to see each other
    await waitForAllPeersVisible(
      [
        { page: host.page, name: 'Host' },
        { page: peer1.page, name: 'Peer1' },
        { page: peer2.page, name: 'Peer2' }
      ],
      3,
      120000
    );

    // Verify all can see each other
    await expect(host.page.locator(selectors.session.peerTileByName('PeerBob'))).toBeVisible({
      timeout: 10000
    });
    await expect(host.page.locator(selectors.session.peerTileByName('PeerCharlie'))).toBeVisible({
      timeout: 10000
    });
    await expect(peer1.page.locator(selectors.session.peerTileByName('HostAlice'))).toBeVisible({
      timeout: 10000
    });
    await expect(peer2.page.locator(selectors.session.peerTileByName('HostAlice'))).toBeVisible({
      timeout: 10000
    });

    console.log('[E2E] Simultaneous join test passed!');
  });

  test('rejoin after leaving - peer is visible again', async () => {
    const host = await launchApp('host');
    apps.push(host);
    const participant = await launchApp('participant');
    apps.push(participant);

    // Handle dialogs
    for (const app of apps) {
      app.page.on('dialog', async (dialog) => {
        try {
          await dialog.accept();
        } catch {
          /* ignore */
        }
      });
    }

    await setupProfile(host.page, 'HostAlice', 'Alice Full');
    await setupProfile(participant.page, 'PeerBob', 'Bob Full');

    const sessionId = await createSession(host.page);
    await joinSession(participant.page, sessionId);
    await waitForP2PConnection(host.page, participant.page);
    console.log('[E2E] Initial connection established');

    // Verify visibility
    await expect(host.page.locator(selectors.session.peerTileByName('PeerBob'))).toBeVisible({
      timeout: 10000
    });

    // Participant leaves
    const leaveButton = participant.page.locator(selectors.session.leaveButton);
    await leaveButton.click();
    await participant.page.waitForSelector(selectors.home.title, { timeout: 10000 });
    console.log('[E2E] Participant left');

    // Wait for host to detect departure
    await sleep(5000);
    await expect(host.page.locator(selectors.session.peerTileByName('PeerBob'))).not.toBeVisible({
      timeout: 10000
    });
    console.log('[E2E] Host no longer sees participant');

    // Participant rejoins
    await joinSession(participant.page, sessionId);
    console.log('[E2E] Participant rejoining');

    // Wait for reconnection
    await waitForP2PConnection(host.page, participant.page);

    // Verify visibility again
    await expect(host.page.locator(selectors.session.peerTileByName('PeerBob'))).toBeVisible({
      timeout: 10000
    });
    await expect(
      participant.page.locator(selectors.session.peerTileByName('HostAlice'))
    ).toBeVisible({ timeout: 10000 });

    // Verify peer counts
    const hostPeerCount = await getPeerCount(host.page);
    const participantPeerCount = await getPeerCount(participant.page);
    expect(hostPeerCount).toBe(1);
    expect(participantPeerCount).toBe(1);

    console.log('[E2E] Rejoin test passed!');
  });
});
