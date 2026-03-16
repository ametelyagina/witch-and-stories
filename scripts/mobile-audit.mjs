import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/';
const outputDir = process.argv[3] ?? path.resolve('artifacts/mobile-audit');

const deviceProfiles = [
  {
    id: 'iphone-12',
    label: 'iPhone 12',
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  },
  {
    id: 'pixel-7',
    label: 'Pixel 7',
    viewport: { width: 412, height: 915 },
    screen: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
  },
  {
    id: 'iphone-se',
    label: 'iPhone SE',
    viewport: { width: 375, height: 667 },
    screen: { width: 375, height: 667 },
    deviceScaleFactor: 2,
  },
];

const sampleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e0b08d" />
      <stop offset="100%" stop-color="#9a5d44" />
    </linearGradient>
  </defs>
  <rect width="1080" height="1350" rx="0" fill="url(#bg)" />
  <circle cx="520" cy="390" r="190" fill="#fff3e8" opacity="0.92" />
  <rect x="150" y="710" width="780" height="360" rx="52" fill="#4a2d20" opacity="0.92" />
</svg>
`.trim();

const scenarios = [
  {
    id: 'home-empty',
    label: 'Home Empty',
    run: async () => {},
  },
  {
    id: 'text-layer',
    label: 'Text Layer Selected',
    run: async (page) => {
      await page.getByRole('button', { name: /добавить текст/i }).click();
      await page.waitForTimeout(250);
    },
  },
  {
    id: 'image-picker',
    label: 'Image Picker Open',
    run: async (page) => {
      await page
        .locator('input[type=file][accept="image/*"]')
        .setInputFiles({
          name: 'mobile-audit-sample.svg',
          mimeType: 'image/svg+xml',
          buffer: Buffer.from(sampleSvg),
        });
      await page.locator('.image-picker').waitFor({ state: 'visible' });
      await page.waitForTimeout(350);
    },
  },
];

function slugify(value) {
  return value.toLowerCase().replace(/\s+/g, '-');
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const getRect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();

      return {
        selector,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    };

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      app: getRect('.app'),
      topbar: getRect('.topbar'),
      workbench: getRect('.workbench'),
      actionRail: getRect('.action-rail'),
      canvasColumn: getRect('.canvas-column'),
      presetStrip: getRect('.preset-strip'),
      canvasWrap: getRect('.canvas-wrap'),
      sidebar: getRect('.sidebar'),
      imagePicker: getRect('.image-picker'),
      imagePickerLayout: getRect('.image-picker-layout'),
      imagePickerSidebar: getRect('.image-picker-sidebar'),
      imagePickerStageShell: getRect('.image-picker-stage-shell'),
    };
  });
}

async function runScenario(browser, deviceProfile, scenario) {
  const context = await browser.newContext({
    viewport: deviceProfile.viewport,
    screen: deviceProfile.screen,
    deviceScaleFactor: deviceProfile.deviceScaleFactor,
    hasTouch: true,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const messages = [];
  let error = null;

  page.on('console', (msg) =>
    messages.push({
      type: msg.type(),
      text: msg.text(),
    }),
  );
  page.on('pageerror', (err) =>
    messages.push({
      type: 'pageerror',
      text: err.message,
    }),
  );

  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  try {
    await scenario.run(page);
  } catch (scenarioError) {
    error = {
      name: scenarioError?.name ?? 'Error',
      message: scenarioError instanceof Error ? scenarioError.message : String(scenarioError),
    };
  }

  const screenshotPath = path.join(
    outputDir,
    `${deviceProfile.id}-${scenario.id}.png`,
  );
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });

  const metrics = await collectMetrics(page);
  await context.close();

  return {
    device: deviceProfile.label,
    deviceId: deviceProfile.id,
    scenario: scenario.id,
    label: scenario.label,
    screenshotPath,
    metrics,
    messages,
    error,
  };
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const deviceProfile of deviceProfiles) {
      for (const scenario of scenarios) {
        const result = await runScenario(browser, deviceProfile, scenario);
        results.push(result);
        process.stdout.write(
          `${deviceProfile.label} / ${scenario.id}${result.error ? ' / failed' : ''}\n`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  const resultPath = path.join(outputDir, 'results.json');
  await fs.writeFile(resultPath, JSON.stringify({ baseUrl, results }, null, 2), 'utf8');
  process.stdout.write(`Saved ${resultPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
