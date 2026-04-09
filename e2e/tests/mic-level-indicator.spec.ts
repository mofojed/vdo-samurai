import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type AppInstance } from '../fixtures/electron-app';
import { setupProfile, createSession } from '../helpers/test-setup';
import { selectors } from '../helpers/selectors';

test.describe('Mic Level Indicator', () => {
  let host: AppInstance;

  test.afterEach(async () => {
    if (host) await closeApp(host);
  });

  test('mic button shows audio level indicator when audio is detected', async () => {
    host = await launchApp('host');
    await setupProfile(host.page, 'Host User');
    await createSession(host.page);

    // Wait for mic button to appear
    const micButton = host.page.locator(selectors.session.micToggleIndicator);
    await expect(micButton).toBeVisible({ timeout: 10000 });

    // Verify the mic is enabled (not muted)
    await expect(micButton).toHaveAttribute('aria-pressed', 'true');

    // Wait for audio level to rise above threshold (mock generates 440Hz sine wave)
    // The useAudioLevel hook uses requestAnimationFrame, so give it time to stabilize
    await host.page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const level = parseFloat(el.getAttribute('data-mic-level') || '0');
        return level > 0.05;
      },
      selectors.session.micToggleIndicator,
      { timeout: 15000, polling: 500 }
    );

    // Verify the box-shadow indicator is present
    const boxShadow = await micButton.evaluate((el) => {
      return window.getComputedStyle(el).boxShadow;
    });
    expect(boxShadow).not.toBe('none');
    expect(boxShadow).toContain('rgb'); // Should have green glow

    // Now mute the microphone
    await micButton.click();
    await expect(micButton).toHaveAttribute('aria-pressed', 'false');

    // After muting, data-mic-level should be 0
    await expect(micButton).toHaveAttribute('data-mic-level', '0');

    // Box-shadow should be removed when muted
    const mutedBoxShadow = await micButton.evaluate((el) => {
      return window.getComputedStyle(el).boxShadow;
    });
    expect(mutedBoxShadow).toBe('none');

    // Unmute and verify indicator returns
    await micButton.click();
    await expect(micButton).toHaveAttribute('aria-pressed', 'true');

    // Wait for audio level to rise again after unmute
    await host.page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const level = parseFloat(el.getAttribute('data-mic-level') || '0');
        return level > 0.05;
      },
      selectors.session.micToggleIndicator,
      { timeout: 15000, polling: 500 }
    );
  });

  test('mic level indicator reflects actual audio level value', async () => {
    host = await launchApp('host');
    await setupProfile(host.page, 'Host User');
    await createSession(host.page);

    const micButton = host.page.locator(selectors.session.micToggleIndicator);
    await expect(micButton).toBeVisible({ timeout: 10000 });

    // Wait for stable audio level readings
    await host.page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const level = parseFloat(el.getAttribute('data-mic-level') || '0');
        return level > 0.05;
      },
      selectors.session.micToggleIndicator,
      { timeout: 15000, polling: 500 }
    );

    // Read the level and verify it's in a reasonable range
    const level = await micButton.getAttribute('data-mic-level');
    const numLevel = parseFloat(level || '0');
    expect(numLevel).toBeGreaterThan(0.05);
    expect(numLevel).toBeLessThanOrEqual(1.0);
  });
});
