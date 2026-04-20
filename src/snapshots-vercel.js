const puppeteer    = require('puppeteer');
const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');

const projects = require('../config/projects');
const pages    = require('../config/pages');

// Usage: node src/snapshots-vercel.js <project-name>
// Set PERCY_TOKEN in your environment before running.

const projectName = process.argv[2];

const project      = projects[projectName];
const projectPages = pages[projectName];

const CAPTURE_WIDTH  = 1440;
const CAPTURE_HEIGHT = 900;
const OUTPUT_DIR     = path.join(__dirname, '..', 'percy-screenshots');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function ensureOutputDir() {
  if (fs.existsSync(OUTPUT_DIR)) fs.rmSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function scrollUntilAllImagesLoaded(page) {
  let previousLoaded = -1;
  let passCount      = 0;

  while (passCount < 5) {
    passCount++;

    await page.evaluate(async () => {
      await new Promise(resolve => {
        const distance = 300, delay = 150;
        let scrolled = 0;
        window.scrollTo(0, 0);
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          scrolled += distance;
          if (scrolled >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, delay);
      });
    });

    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20000 }).catch(() => {});

    const { total, loaded } = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      return {
        total:  imgs.length,
        loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
      };
    });

    console.log(`  scroll pass ${passCount}: ${loaded}/${total} images loaded`);

    if (loaded === previousLoaded || loaded >= total * 0.95) break;
    previousLoaded = loaded;
    await sleep(500);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  // Force-load any images still stuck in overflow-hidden containers (e.g. carousels)
  // that scroll-based lazy loading never reached.
  await page.evaluate(async () => {
    const unloaded = [...document.querySelectorAll('img')].filter(i => !i.complete || i.naturalWidth === 0);
    await Promise.all(unloaded.map(img => new Promise(resolve => {
      img.loading = 'eager';
      img.onload  = resolve;
      img.onerror = resolve;
      const src = img.src;
      img.src = '';
      img.src = src;
    })));
  });
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {});
}

async function capturePage(browser, snapshotName, pagePath) {
  const url  = `${project.baseUrl}${pagePath}`;
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT });

  await page.setRequestInterception(true);
  page.on('request', req => {
    const blocked = ['google-analytics', 'googletagmanager', 'hotjar', 'intercom'];
    blocked.some(b => req.url().includes(b)) ? req.abort() : req.continue();
  });

  try {
    console.log(`Capturing: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await scrollUntilAllImagesLoaded(page);
    await page.bringToFront();
    await sleep(300);
    await page.screenshot({
      path:     path.join(OUTPUT_DIR, `${snapshotName}.png`),
      fullPage: true,
    });
  } catch (err) {
    console.error(`  Failed: ${err.message}`);
  } finally {
    await page.close();
  }
}

(async () => {
  ensureOutputDir();

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  console.log(`\n=== Capturing screenshots for: ${project.name} ===\n`);

  for (const pagePath of projectPages) {
    const name = pagePath === '/' ? 'home' : pagePath.replace(/\//g, '-').replace(/^-|-$/g, '');
    await capturePage(browser, name, pagePath);
  }

  await browser.close();

  console.log(`\n=== Uploading to Percy ===\n`);
  execSync(`npx percy upload ${OUTPUT_DIR}`, {
    stdio: 'inherit',
    env: { ...process.env },
  });

  console.log(`\n=== Done! ===\n`);
})();
