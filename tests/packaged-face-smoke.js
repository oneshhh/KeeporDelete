const assert = require('node:assert/strict');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

async function run() {
  const projectRoot = path.resolve(__dirname, '..');
  const executablePath = path.join(projectRoot, 'dist', 'win-unpacked', 'Keep or Delete.exe');
  const sampleFolder = path.join(projectRoot, 'test-media');
  const app = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      KEEP_OR_DELETE_TEST_USER_DATA: path.join(projectRoot, 'test-output', 'packaged-user-data')
    }
  });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.waitForSelector('#landingScreen.active');
    await page.waitForFunction(() => document.fonts.check('16px "Inter Variable"'));
    assert.match(
      await page.evaluate(() => getComputedStyle(document.body).fontFamily),
      /Inter Variable/
    );
    await page.evaluate(async (folder) => window.startFolder(folder, false, null, true), sampleFolder);
    await page.waitForSelector('#peopleScreen.active');
    await page.waitForFunction(() => {
      const title = document.querySelector('#faceScanTitle')?.textContent || '';
      return title.includes('up to date') || title.includes('needs attention');
    }, null, { timeout: 120000 });
    assert.equal((await page.locator('#faceScanCard').getAttribute('class')).includes('error'), false);

    await page.click('#rescanFacesButton');
    await page.waitForFunction(() => {
      const title = document.querySelector('#faceScanTitle')?.textContent || '';
      return title.includes('Loading') || title.includes('Scanning');
    });
    await page.waitForFunction(() => {
      const title = document.querySelector('#faceScanTitle')?.textContent || '';
      return title.includes('up to date') || title.includes('needs attention');
    }, null, { timeout: 120000 });
    assert.equal((await page.locator('#faceScanCard').getAttribute('class')).includes('error'), false);
    assert.deepEqual(pageErrors, []);
    console.log('Packaged smoke test passed: bundled variable font and offline face models load correctly.');
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
