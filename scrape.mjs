import { chromium } from 'playwright';
import fs from 'fs';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://platform.openai.com/docs/guides/responses-api');
  await page.waitForLoadState('networkidle');
  fs.writeFileSync('doc.txt', await page.evaluate(() => document.body.innerText));
  await browser.close();
})();
