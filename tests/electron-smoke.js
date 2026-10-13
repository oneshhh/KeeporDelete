const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

async function run() {
  const projectRoot = path.resolve(__dirname, '..');
  const sampleFolder = path.join(projectRoot, 'test-media');
  const outputFolder = path.join(projectRoot, 'test-output');
  fs.mkdirSync(outputFolder, { recursive: true });

  const app = await electron.launch({
    args: [projectRoot],
    cwd: projectRoot,
    env: { ...process.env, KEEP_OR_DELETE_TEST: '1' }
  });

  const page = await app.firstWindow();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.waitForSelector('#landingScreen.active');
    assert.equal(await page.locator('h1').first().textContent(), 'Keep or Delete');
    await page.waitForFunction(() => document.fonts.check('16px "Inter Variable"'));
    assert.match(
      await page.evaluate(() => getComputedStyle(document.body).fontFamily),
      /Inter Variable/
    );
    await page.screenshot({ path: path.join(outputFolder, '01-landing.png') });

    await page.evaluate(async (folder) => {
      await window.startFolder(folder, false);
    }, sampleFolder);
    await page.waitForSelector('#triageScreen.active');
    assert.equal(await page.locator('#photoModeCount').textContent(), '2');
    assert.equal(await page.locator('#videoModeCount').textContent(), '1');
    assert.equal(await page.locator('#kindBadge').textContent(), 'LIVE PHOTO');
    await page.waitForSelector('#sessionSidebar:not(.hidden)');
    assert.equal(await page.locator('#sidebarFolderName').textContent(), 'test-media');
    assert.equal(await page.locator('#sidebarTotalItems').textContent(), '3');
    assert.equal(await page.locator('#sidebarPhotoCount').textContent(), '2');
    assert.equal(await page.locator('#sidebarVideoCount').textContent(), '1');
    assert.equal(await page.locator('#sidebarLiveCount').textContent(), '1');
    assert.notEqual(await page.locator('#sidebarTotalStorage').textContent(), '0 MB');

    await page.click('.nav-button[data-route="landing"]');
    await page.waitForSelector('#landingScreen.active');
    await page.waitForFunction(() => document.querySelector('#sessionSidebar').classList.contains('hidden'));
    await page.waitForSelector('#resumeCard:not(.hidden)');
    await page.screenshot({ path: path.join(outputFolder, '02-home-return.png') });
    await page.click('#resumeButton');
    await page.waitForSelector('#triageScreen.active');
    assert.equal(await page.locator('#kindBadge').textContent(), 'LIVE PHOTO');
    await page.screenshot({ path: path.join(outputFolder, '02-photo-triage.png') });

    await page.click('#livePlayButton');
    await page.waitForSelector('#mediaSurface video');
    await page.waitForFunction(() => {
      const video = document.querySelector('#mediaSurface video');
      return video && video.readyState >= 2 && document.querySelector('#mediaLoading').classList.contains('hidden');
    }, null, { timeout: 30000 });
    await page.screenshot({ path: path.join(outputFolder, '03-live-photo.png') });

    await page.keyboard.press('d');
    assert.equal(await page.locator('#trashCount').textContent(), '1');
    assert.notEqual(await page.locator('#sidebarReclaimedStorage').textContent(), '0 MB');
    await page.click('#previousButton');
    assert.equal(await page.locator('#kindBadge').textContent(), 'LIVE PHOTO');
    assert.equal(await page.locator('#trashCount').textContent(), '0');
    assert.equal(await page.locator('#sidebarReclaimedStorage').textContent(), '0 MB');

    await page.keyboard.press('d');
    await page.keyboard.press('d');
    await page.waitForFunction(() => document.querySelector('#videoModeButton').classList.contains('active'));
    assert.equal(await page.locator('#kindBadge').textContent(), 'VIDEO');
    await page.screenshot({ path: path.join(outputFolder, '04-video-mode.png') });

    await page.keyboard.press('d');
    await page.waitForSelector('#reviewScreen.active');
    assert.equal(await page.locator('.review-card').count(), 3);

    await page.locator('.review-toolbar .check-row').click();
    await page.locator('.review-card').first().click();
    await page.click('#restoreSelectedButton');
    assert.equal(await page.locator('.review-card').count(), 2);
    await page.locator('.review-toolbar .check-row').click();
    await page.screenshot({ path: path.join(outputFolder, '05-trash-review.png') });

    await page.click('#deleteSelectedButton');
    await page.waitForSelector('#confirmModal:not(.hidden)');
    assert.match(await page.locator('#confirmCount').textContent(), /2 media items/);
    await page.screenshot({ path: path.join(outputFolder, '06-confirmation.png') });
    await page.click('#confirmDeleteButton');
    await page.waitForFunction(() => document.querySelector('#deleteProgressLabel').textContent === 'Moving 1 of 2');
    assert.equal(await page.locator('#deleteProgressBar').getAttribute('style'), 'width: 50%;');
    await page.screenshot({ path: path.join(outputFolder, '07-delete-progress.png') });
    await page.waitForSelector('#completionScreen.active');
    assert.equal(await page.locator('#completeKept').textContent(), '1');
    assert.equal(await page.locator('#completeDeleted').textContent(), '2');
    await page.screenshot({ path: path.join(outputFolder, '08-complete.png') });

    assert.deepEqual(pageErrors, []);
    console.log('Smoke test passed: custom logo, folder statistics, Home, folder resume, Live Photo, Previous, video mode, review, restore, deletion progress, and completion.');
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
