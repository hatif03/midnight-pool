import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const dir = 'docs/submit';
await mkdir(dir, { recursive: true });
const origin = 'https://midnight-pool-one.vercel.app/';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 896, height: 414 } });
page.setDefaultTimeout(30_000);
await page.goto(origin, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#app canvas');
await page.screenshot({ path: path.join(dir, '01-lobby.png') });

await page.click('#btn-hall');
await page.waitForSelector('#hall-modal.show');
await page.waitForFunction(() => /Live:|Vivo:/.test(document.getElementById('hall-status')?.textContent || ''));
await page.screenshot({ path: path.join(dir, '02-hall.png') });
await page.locator('#hall-modal button').filter({ hasText: /close|cerrar/i }).click();

await page.click('#btn-settings');
await page.waitForSelector('#settings-modal.show');
await page.screenshot({ path: path.join(dir, '03-settings.png') });
await page.locator('#settings-modal button').filter({ hasText: /close|cerrar/i }).click();

await page.click('#btn-solo');
await page.waitForFunction(() => document.getElementById('menu')?.classList.contains('hidden'));
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(dir, '04-solo.png') });
await browser.close();

const mobileBrowser = await chromium.launch({ channel: 'chrome', headless: true });
const mobile = await mobileBrowser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(origin, { waitUntil: 'domcontentloaded' });
await mobile.waitForSelector('#rotate-overlay');
await mobile.screenshot({ path: path.join(dir, '05-portrait.png') });
await mobileBrowser.close();
console.log('wrote docs/submit');
