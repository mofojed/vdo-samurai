import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { launchApp, closeApp, type AppInstance } from '../fixtures/electron-app';
import { selectors } from '../helpers/selectors';
import { sleep } from '../helpers/wait-helpers';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, type ChildProcess } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO_PATH = path.join(__dirname, '../test-assets/videos/host-screen.mp4');
const PROJECT_ROOT = path.join(__dirname, '../..');

async function startDevServer(): Promise<{ process: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const devServer = spawn('npm', ['run', 'dev:web'], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        devServer.kill();
        reject(new Error('Dev server startup timeout'));
      }
    }, 30000);

    devServer.stdout?.on('data', (data) => {
      const output = data.toString();
      const cleanOutput = output.replace(/\x1B\[[0-9;]*[mK]/g, '');
      const match = cleanOutput.match(/Local:\s*(http:\/\/localhost:\d+[^\s]*)/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        const url = match[1].replace(/\/$/, '');
        setTimeout(() => resolve({ process: devServer, url }), 1000);
      }
    });

    devServer.stderr?.on('data', (data) => {
      console.log('[DevServer stderr]', data.toString());
    });

    devServer.on('error', (err) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

/**
 * DIAGNOSTIC TEST: Trace every step of speed dial streaming
 *
 * This test is designed to find exactly where the flow breaks.
 */
test.describe('Speed Dial Diagnostic', () => {
  let host: AppInstance;
  let browser: Browser;
  let participantPage: Page;
  let devServer: ChildProcess | null = null;
  let webAppUrl: string;

  test.beforeAll(async () => {
    console.log('[DIAG] Starting Vite dev server...');
    const server = await startDevServer();
    devServer = server.process;
    webAppUrl = server.url;
    console.log('[DIAG] Dev server at:', webAppUrl);
  });

  test.afterAll(async () => {
    if (devServer) {
      devServer.kill('SIGTERM');
      await sleep(1000);
    }
  });

  test.afterEach(async () => {
    if (participantPage) await participantPage.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (host) await closeApp(host);
  });

  test('diagnose speed dial flow step by step', async () => {
    // ========== STEP 1: Launch apps ==========
    console.log('\n[DIAG] ========== STEP 1: Launch apps ==========');

    host = await launchApp('host');
    await host.page.waitForSelector('h1:has-text("Welcome to VDO Samurai")', { timeout: 15000 });
    await host.page.fill('#display-name', 'Electron Host');
    await host.page.fill('#full-name', 'Electron Host');
    await host.page.click('button:has-text("Continue")');
    await host.page.waitForSelector(selectors.home.title, { timeout: 10000 });
    await host.page.click(selectors.home.createRoomButton);
    await host.page.waitForSelector(selectors.session.recordButton, { timeout: 30000 });

    const hostUrl = host.page.url();
    const sessionId = decodeURIComponent(hostUrl.match(/\/session\/([^/]+)/)![1]);
    console.log('[DIAG] Session ID:', sessionId);

    // Launch browser
    browser = await chromium.launch({
      headless: process.env.HEADLESS === 'true',
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    });
    const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
    participantPage = await context.newPage();

    // Capture all browser console logs
    const browserLogs: string[] = [];
    participantPage.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      browserLogs.push(text);
      if (msg.text().includes('TrysteroProvider') || msg.text().includes('SpeedDial') || msg.text().includes('stream')) {
        console.log('[BROWSER]', text);
      }
    });

    await participantPage.goto(`${webAppUrl}/#/`, { timeout: 30000 });
    await participantPage.waitForSelector('h1:has-text("Welcome to VDO Samurai")', { timeout: 30000 });
    await participantPage.fill('#display-name', 'Browser Participant');
    await participantPage.fill('#full-name', 'Browser Participant');
    await participantPage.click('button:has-text("Continue")');
    await participantPage.waitForSelector(selectors.home.title, { timeout: 10000 });
    await participantPage.fill(selectors.home.roomCodeInput, sessionId);
    await participantPage.click(selectors.home.joinRoomButton);
    await participantPage.waitForSelector(selectors.session.participantList, { timeout: 30000 });

    // ========== STEP 2: Wait for P2P connection ==========
    console.log('\n[DIAG] ========== STEP 2: Wait for P2P ==========');

    let connected = false;
    for (let i = 0; i < 30 && !connected; i++) {
      await sleep(1000);
      const hostTiles = await host.page.locator('[role="listitem"]').count();
      const browserTiles = await participantPage.locator('[role="listitem"]').count();
      if (hostTiles >= 2 && browserTiles >= 2) {
        connected = true;
        console.log('[DIAG] P2P connected! Tiles:', hostTiles, browserTiles);
      }
    }
    expect(connected).toBe(true);

    // Verify camera streams work first
    await sleep(2000);
    const cameraStreamCheck = await participantPage.evaluate(() => {
      const peerStore = (window as any).usePeerStore;
      if (!peerStore) return { error: 'no store' };
      const peers = peerStore.getState().peers;
      const hostPeer = peers.find((p: any) => p.name?.includes('Electron') || p.name?.includes('Host'));
      return {
        found: !!hostPeer,
        name: hostPeer?.name,
        hasStream: !!hostPeer?.stream,
        hasScreenStream: !!hostPeer?.screenStream,
        streamActive: hostPeer?.stream?.active,
        streamTracks: hostPeer?.stream?.getVideoTracks()?.length
      };
    });
    console.log('[DIAG] Camera stream check:', cameraStreamCheck);
    expect(cameraStreamCheck.hasStream).toBe(true);

    // ========== STEP 3: Check media server on host ==========
    console.log('\n[DIAG] ========== STEP 3: Check media server ==========');

    const mediaServerCheck = await host.page.evaluate(async () => {
      if (!window.electronAPI?.speedDial) {
        return { error: 'No speedDial API' };
      }
      const port = await window.electronAPI.speedDial.getMediaServerPort();
      const token = await window.electronAPI.speedDial.getMediaServerToken();
      return { port, hasToken: !!token };
    });
    console.log('[DIAG] Media server:', mediaServerCheck);
    expect(mediaServerCheck.port).toBeGreaterThan(0);

    // ========== STEP 4: Import clip ==========
    console.log('\n[DIAG] ========== STEP 4: Import clip ==========');

    const importResult = await host.page.evaluate(async (videoPath) => {
      return window.electronAPI!.speedDial!.importClipByPath(videoPath);
    }, TEST_VIDEO_PATH);
    console.log('[DIAG] Import result:', importResult);
    expect(importResult.success).toBe(true);

    // Add to store
    await host.page.evaluate((clip) => {
      const store = (window as any).useSpeedDialStore;
      store.getState().addClip({
        id: `diag-clip-${Date.now()}`,
        name: clip.name,
        path: clip.path,
        duration: clip.duration,
        thumbnailUrl: null
      });
    }, importResult.clip);

    const storeCheck = await host.page.evaluate(() => {
      const store = (window as any).useSpeedDialStore;
      return { clips: store.getState().clips.length };
    });
    console.log('[DIAG] Store has clips:', storeCheck.clips);

    // ========== STEP 5: Play clip - trace every step ==========
    console.log('\n[DIAG] ========== STEP 5: Play clip ==========');

    // Open panel
    await host.page.locator('button[aria-label="Open Speed Dial"]').click();
    await expect(host.page.locator('[role="dialog"][aria-label="Speed Dial"]')).toBeVisible();
    await expect(host.page.locator('[data-testid="speed-dial-clip"]')).toBeVisible();

    // Before clicking play, set up detailed monitoring on host
    await host.page.evaluate(() => {
      // Intercept addLocalStream to log when it's called
      const originalAddLocalStream = (window as any).__originalAddLocalStream;
      console.log('[HOST-DIAG] Setting up addLocalStream interceptor');
    });

    // Click play
    console.log('[DIAG] Clicking play button...');
    await host.page.locator('[data-testid="speed-dial-clip"] button[aria-label^="Play"]').first().click();

    // Wait and check what happened on the host
    await sleep(2000);

    const hostPlaybackState = await host.page.evaluate(() => {
      const sessionStore = (window as any).useSessionStore;
      const speedDialStore = (window as any).useSpeedDialStore;

      const localScreenStream = sessionStore.getState().localScreenStream;
      const isPlaying = speedDialStore.getState().isPlaying;
      const activeClipId = speedDialStore.getState().activeClipId;

      return {
        isPlaying,
        activeClipId,
        hasLocalScreenStream: !!localScreenStream,
        localScreenStreamActive: localScreenStream?.active,
        localScreenStreamTracks: localScreenStream?.getVideoTracks()?.length,
        localScreenStreamTrackState: localScreenStream?.getVideoTracks()?.[0]?.readyState
      };
    });
    console.log('[DIAG] Host playback state:', hostPlaybackState);

    // ========== STEP 6: Check what browser received ==========
    console.log('\n[DIAG] ========== STEP 6: Check browser ==========');

    // Wait for stream to potentially arrive
    await sleep(5000);

    const browserState = await participantPage.evaluate(() => {
      const peerStore = (window as any).usePeerStore;
      const sessionStore = (window as any).useSessionStore;

      const peers = peerStore.getState().peers;
      const hostPeer = peers.find((p: any) => p.name?.includes('Electron') || p.name?.includes('Host'));

      return {
        focusedPeerId: sessionStore.getState().focusedPeerId,
        hostPeerId: hostPeer?.id,
        hostName: hostPeer?.name,
        hasStream: !!hostPeer?.stream,
        hasScreenStream: !!hostPeer?.screenStream,
        screenStreamActive: hostPeer?.screenStream?.active,
        screenStreamTracks: hostPeer?.screenStream?.getVideoTracks()?.length,
        screenStreamTrackState: hostPeer?.screenStream?.getVideoTracks()?.[0]?.readyState,
        isScreenSharing: hostPeer?.isScreenSharing
      };
    });
    console.log('[DIAG] Browser state:', browserState);

    // ========== STEP 7: Check if screen share status was received ==========
    console.log('\n[DIAG] ========== STEP 7: Analyze logs ==========');

    const screenShareLogs = browserLogs.filter(l =>
      l.includes('Screen share') ||
      l.includes('screenStream') ||
      l.includes('screen') ||
      l.includes('Received stream')
    );
    console.log('[DIAG] Relevant browser logs:');
    screenShareLogs.forEach(l => console.log('  ', l));

    // ========== STEP 8: Analyze the video content if stream exists ==========
    if (browserState.hasScreenStream) {
      console.log('\n[DIAG] ========== STEP 8: Analyze video ==========');

      const frameAnalysis = await participantPage.evaluate(async () => {
        const peerStore = (window as any).usePeerStore;
        const peers = peerStore.getState().peers;
        const hostPeer = peers.find((p: any) => p.name?.includes('Electron') || p.name?.includes('Host'));

        if (!hostPeer?.screenStream) return { error: 'No screen stream' };

        const video = document.createElement('video');
        video.srcObject = hostPeer.screenStream;
        video.muted = true;
        document.body.appendChild(video);

        try {
          await video.play();
          await new Promise(r => setTimeout(r, 1000));

          if (video.videoWidth === 0) {
            return { error: 'Video has no dimensions', width: video.videoWidth, height: video.videoHeight };
          }

          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0, 320, 180);

          const imageData = ctx.getImageData(0, 0, 320, 180);
          let totalBrightness = 0;
          for (let i = 0; i < imageData.data.length; i += 4) {
            totalBrightness += (imageData.data[i] + imageData.data[i+1] + imageData.data[i+2]) / 3;
          }
          const avgBrightness = totalBrightness / (imageData.data.length / 4);

          return {
            success: true,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            avgBrightness,
            isBlack: avgBrightness < 10
          };
        } finally {
          video.srcObject = null;
          document.body.removeChild(video);
        }
      });
      console.log('[DIAG] Frame analysis:', frameAnalysis);
    } else {
      console.log('\n[DIAG] ========== NO SCREEN STREAM RECEIVED ==========');
      console.log('[DIAG] The stream never reached the browser!');
      console.log('[DIAG] Host says isPlaying:', hostPlaybackState.isPlaying);
      console.log('[DIAG] Host has localScreenStream:', hostPlaybackState.hasLocalScreenStream);
      console.log('[DIAG] Browser sees isScreenSharing:', browserState.isScreenSharing);
    }

    // Final assertion
    console.log('\n[DIAG] ========== FINAL RESULT ==========');
    if (!browserState.hasScreenStream) {
      console.log('[DIAG] FAILURE: Screen stream not received by browser');
      console.log('[DIAG] - Host playback working:', hostPlaybackState.isPlaying);
      console.log('[DIAG] - Host has local screen stream:', hostPlaybackState.hasLocalScreenStream);
      console.log('[DIAG] - Browser knows host is sharing:', browserState.isScreenSharing);
    }

    expect(browserState.hasScreenStream).toBe(true);
  });
});
