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

// Start the Vite dev server for web participants
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
      console.log('[DevServer]', output);
      // Strip ANSI color codes for matching
      const cleanOutput = output.replace(/\x1B\[[0-9;]*[mK]/g, '');
      // Look for Vite's "Local:" URL in output (may include path like /vdo-samurai/)
      const match = cleanOutput.match(/Local:\s*(http:\/\/localhost:\d+[^\s]*)/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        // Remove trailing slash if present, we'll add it with the hash route
        const url = match[1].replace(/\/$/, '');
        console.log('[DevServer] Detected URL:', url);
        // Give it a moment to fully start
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
 * Speed Dial: Electron Host to Browser Participant Test
 *
 * This test verifies the REAL scenario where:
 * - Host runs in Electron app
 * - Participant joins via web browser (Chrome)
 * - Speed dial video is streamed from Electron to browser
 *
 * This is the actual failure case reported by the user.
 */
test.describe('Speed Dial: Electron to Browser Streaming', () => {
  let host: AppInstance;
  let browser: Browser;
  let participantPage: Page;
  let devServer: ChildProcess | null = null;
  let webAppUrl: string;

  test.beforeAll(async () => {
    console.log('[E2E] Starting Vite dev server for web participant...');
    try {
      const server = await startDevServer();
      devServer = server.process;
      webAppUrl = server.url;
      console.log('[E2E] Dev server started at:', webAppUrl);
    } catch (err) {
      console.error('[E2E] Failed to start dev server:', err);
      throw err;
    }
  });

  test.afterAll(async () => {
    if (devServer) {
      console.log('[E2E] Stopping dev server...');
      devServer.kill('SIGTERM');
      // Give it time to clean up
      await sleep(1000);
    }
  });

  test.afterEach(async () => {
    if (participantPage) {
      await participantPage.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (host) {
      await closeApp(host);
    }
  });

  test('speed dial from Electron host is visible to browser participant (not black)', async () => {
    // Step 1: Launch Electron host
    console.log('[E2E] Launching Electron host...');
    host = await launchApp('host');

    // Set up host profile
    console.log('[E2E] Setting up host profile...');
    await host.page.waitForSelector('h1:has-text("Welcome to VDO Samurai")', { timeout: 15000 });
    await host.page.fill('#display-name', 'Electron Host');
    await host.page.fill('#full-name', 'Electron Host Full');
    await host.page.click('button:has-text("Continue")');

    // Host creates session
    await host.page.waitForSelector(selectors.home.title, { timeout: 10000 });
    console.log('[E2E] Host creating session...');
    await host.page.click(selectors.home.createRoomButton);
    await host.page.waitForSelector(selectors.session.recordButton, { timeout: 30000 });

    // Get session ID
    const hostUrl = host.page.url();
    const sessionIdMatch = hostUrl.match(/\/session\/([^/]+)/);
    expect(sessionIdMatch).toBeTruthy();
    const sessionId = decodeURIComponent(sessionIdMatch![1]);
    console.log('[E2E] Session ID:', sessionId);

    // Step 2: Launch Chrome browser as participant
    console.log('[E2E] Launching Chrome browser participant...');
    browser = await chromium.launch({
      headless: process.env.HEADLESS === 'true' || process.env.CI === 'true',
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--allow-file-access-from-files'
      ]
    });

    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    participantPage = await context.newPage();

    // Navigate to the web version of the app (served by Vite dev server)
    // The URL may already include a path like /vdo-samurai/, so append #/ for hash routing
    const fullUrl = `${webAppUrl}/#/`;
    console.log('[E2E] Browser navigating to:', fullUrl);

    // Listen for console messages for debugging
    participantPage.on('console', msg => {
      console.log('[Browser Console]', msg.type(), msg.text());
    });
    participantPage.on('pageerror', err => {
      console.log('[Browser Error]', err.message);
    });

    await participantPage.goto(fullUrl, { timeout: 30000 });

    // Wait for app to load - give it more time and log what we see
    console.log('[E2E] Waiting for app to load...');
    await sleep(2000);
    const pageTitle = await participantPage.title();
    const pageUrl = participantPage.url();
    console.log('[E2E] Page title:', pageTitle, 'URL:', pageUrl);

    // Take a screenshot to see what's showing
    const screenshot = await participantPage.screenshot({ path: 'e2e/test-results/browser-participant-debug.png' });
    console.log('[E2E] Screenshot saved');

    await participantPage.waitForSelector('h1:has-text("Welcome to VDO Samurai")', { timeout: 30000 });

    // Set up participant profile
    console.log('[E2E] Setting up browser participant profile...');
    await participantPage.fill('#display-name', 'Browser Participant');
    await participantPage.fill('#full-name', 'Browser Participant Full');
    await participantPage.click('button:has-text("Continue")');

    // Join the session
    await participantPage.waitForSelector(selectors.home.title, { timeout: 10000 });
    console.log('[E2E] Browser participant joining session...');
    await participantPage.fill(selectors.home.roomCodeInput, sessionId);
    await participantPage.click(selectors.home.joinRoomButton);

    // Wait for participant to be in session
    await participantPage.waitForSelector(selectors.session.participantList, { timeout: 30000 });

    // Step 3: Wait for P2P connection
    console.log('[E2E] Waiting for P2P connection...');
    const maxWaitTime = 90000;
    const pollInterval = 2000;
    const startTime = Date.now();

    let connected = false;
    while (Date.now() - startTime < maxWaitTime && !connected) {
      await sleep(pollInterval);
      const hostTileCount = await host.page.locator('[role="listitem"]').count();
      const participantTileCount = await participantPage.locator('[role="listitem"]').count();

      console.log('[E2E] Tile counts - Host:', hostTileCount, 'Participant:', participantTileCount);

      if (hostTileCount >= 2 && participantTileCount >= 2) {
        connected = true;
        console.log('[E2E] P2P connection established!');
      }
    }

    if (!connected) {
      // Log more debug info
      const hostPeers = await host.page.evaluate(() => {
        const store = (window as any).usePeerStore;
        return store ? store.getState().peers.map((p: any) => ({ id: p.id, name: p.name })) : [];
      });
      console.log('[E2E] Host peers:', hostPeers);
      throw new Error('P2P connection timeout');
    }

    // Wait for streams to stabilize
    await sleep(3000);

    // Step 4: Import and play speed dial clip on host
    console.log('[E2E] Importing speed dial clip on Electron host...');
    const importResult = await host.page.evaluate(async (videoPath) => {
      if (!window.electronAPI?.speedDial?.importClipByPath) {
        return { success: false, error: 'importClipByPath not available' };
      }
      return window.electronAPI.speedDial.importClipByPath(videoPath);
    }, TEST_VIDEO_PATH);

    console.log('[E2E] Import result:', importResult);
    expect(importResult.success).toBe(true);

    // Add clip to store
    await host.page.evaluate(async (clip) => {
      const stores = (window as any);
      if (stores.useSpeedDialStore) {
        stores.useSpeedDialStore.getState().addClip({
          id: `e2e-clip-${Date.now()}`,
          name: clip.name,
          path: clip.path,
          duration: clip.duration,
          thumbnailUrl: null
        });
      }
    }, importResult.clip);

    // Open speed dial and play
    console.log('[E2E] Opening speed dial panel and playing clip...');
    const speedDialButton = host.page.locator('button[aria-label="Open Speed Dial"]');
    await expect(speedDialButton).toBeVisible({ timeout: 5000 });
    await speedDialButton.click();

    const speedDialPanel = host.page.locator('[role="dialog"][aria-label="Speed Dial"]');
    await expect(speedDialPanel).toBeVisible({ timeout: 5000 });

    // Wait for clip to appear and click play
    const clipLocator = host.page.locator('[data-testid="speed-dial-clip"]');
    await expect(clipLocator).toBeVisible({ timeout: 5000 });

    const playButton = host.page.locator('[data-testid="speed-dial-clip"] button[aria-label^="Play"]').first();
    await playButton.click();

    console.log('[E2E] Speed dial playing, waiting for stream transmission...');
    await sleep(5000); // Give time for stream to be transmitted

    // Step 5: Verify browser participant received the stream
    console.log('[E2E] Checking browser participant for screen stream...');

    const participantStreamInfo = await participantPage.evaluate(() => {
      const peerStore = (window as any).usePeerStore;
      if (!peerStore) return { error: 'No peer store' };

      const peers = peerStore.getState().peers;
      console.log('[Browser] All peers:', peers.map((p: any) => ({ id: p.id, name: p.name, hasStream: !!p.stream, hasScreenStream: !!p.screenStream })));

      const hostPeer = peers.find((p: any) => p.name?.includes('Electron') || p.name?.includes('Host'));
      if (!hostPeer) return { error: 'Host peer not found', peers: peers.map((p: any) => p.name) };

      if (!hostPeer.screenStream) {
        return {
          hasScreenStream: false,
          hostName: hostPeer.name,
          hasRegularStream: !!hostPeer.stream
        };
      }

      const videoTrack = hostPeer.screenStream.getVideoTracks()[0];
      return {
        hasScreenStream: true,
        hostName: hostPeer.name,
        active: hostPeer.screenStream.active,
        videoTracks: hostPeer.screenStream.getVideoTracks().length,
        videoTrackEnabled: videoTrack?.enabled,
        videoTrackMuted: videoTrack?.muted,
        videoTrackReadyState: videoTrack?.readyState,
        videoTrackSettings: videoTrack?.getSettings()
      };
    });

    console.log('[E2E] Browser participant stream info:', JSON.stringify(participantStreamInfo, null, 2));

    // Verify participant received the screen stream
    expect(participantStreamInfo.hasScreenStream).toBe(true);
    expect(participantStreamInfo.active).toBe(true);
    expect(participantStreamInfo.videoTracks).toBeGreaterThan(0);

    // Step 6: Analyze actual video content - is it black?
    console.log('[E2E] Analyzing video content on browser participant...');

    const frameAnalysis = await participantPage.evaluate(async () => {
      const peerStore = (window as any).usePeerStore;
      if (!peerStore) return { error: 'No peer store' };

      const peers = peerStore.getState().peers;
      const hostPeer = peers.find((p: any) => p.name?.includes('Electron') || p.name?.includes('Host'));

      if (!hostPeer?.screenStream) return { error: 'No screen stream' };

      const stream = hostPeer.screenStream;
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return { error: 'No video track' };

      // Create video element to capture frame
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.style.position = 'fixed';
      video.style.top = '0';
      video.style.left = '0';
      video.style.width = '640px';
      video.style.height = '360px';
      video.style.zIndex = '99999';
      video.style.border = '3px solid red';
      document.body.appendChild(video);

      try {
        await video.play();

        // Wait for frames to arrive
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('[Browser] Video element state:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          paused: video.paused
        });

        if (video.videoWidth === 0 || video.videoHeight === 0) {
          return {
            error: 'Video has no dimensions',
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState
          };
        }

        // Capture frame to canvas
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = Math.min(video.videoHeight, 360);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Analyze pixels
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        let blackPixels = 0;
        let nonBlackPixels = 0;
        let totalBrightness = 0;
        const sampleSize = Math.min(pixels.length / 4, 10000);

        for (let i = 0; i < sampleSize; i++) {
          const idx = Math.floor(i * (pixels.length / 4 / sampleSize)) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const brightness = (r + g + b) / 3;
          totalBrightness += brightness;

          if (brightness < 10) {
            blackPixels++;
          } else {
            nonBlackPixels++;
          }
        }

        const avgBrightness = totalBrightness / sampleSize;
        const blackRatio = blackPixels / sampleSize;

        return {
          success: true,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          blackPixels,
          nonBlackPixels,
          blackRatio,
          avgBrightness,
          isBlack: blackRatio > 0.95,
          hasContent: blackRatio < 0.95 && avgBrightness > 10
        };
      } finally {
        video.pause();
        video.srcObject = null;
        document.body.removeChild(video);
      }
    });

    console.log('[E2E] Frame analysis result:', JSON.stringify(frameAnalysis, null, 2));

    // THE KEY ASSERTION: Is the video black?
    if (frameAnalysis.success) {
      console.log('[E2E] ========================================');
      console.log('[E2E] RESULT: Video is', frameAnalysis.isBlack ? 'BLACK (FAIL)' : 'NOT BLACK (PASS)');
      console.log('[E2E] Average brightness:', frameAnalysis.avgBrightness);
      console.log('[E2E] Black pixel ratio:', frameAnalysis.blackRatio);
      console.log('[E2E] ========================================');

      expect(frameAnalysis.isBlack).toBe(false);
      expect(frameAnalysis.hasContent).toBe(true);
    } else {
      console.log('[E2E] Frame analysis failed:', frameAnalysis.error);
      // Fail the test if we couldn't even analyze
      expect(frameAnalysis.success).toBe(true);
    }

    // Cleanup
    await host.page.keyboard.press('Escape');
    console.log('[E2E] Test completed!');
  });
});
