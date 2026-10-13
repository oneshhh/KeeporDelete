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
    await page.waitForFunction(() => Boolean(window.__kodTest));
    await page.evaluate(async (folder) => {
      await window.startFolder(folder, false, null, true);
    }, sampleFolder);
    await page.waitForSelector('#peopleScreen.active');
    await page.waitForFunction(
      () => ['complete', 'error'].includes(window.__kodTest.facePhase()),
      null,
      { timeout: 120000 }
    );
    assert.notEqual(await page.evaluate(() => window.__kodTest.facePhase()), 'error');
    await page.click('#rescanFacesButton');
    await page.waitForFunction(() => ['loading', 'scanning'].includes(window.__kodTest.facePhase()));
    await page.waitForFunction(
      () => ['complete', 'error'].includes(window.__kodTest.facePhase()),
      null,
      { timeout: 120000 }
    );
    assert.notEqual(await page.evaluate(() => window.__kodTest.facePhase()), 'error');
    assert.equal(await page.evaluate(() => window.__kodTest.faceIndexedCount()), 2);
    assert.equal(await page.locator('#peopleNavButton').isVisible(), true);
    await page.screenshot({ path: path.join(outputFolder, '09-people-scan.png') });

    await page.evaluate(() => window.__kodTest.injectFaceGroups());
    assert.equal(await page.locator('.person-card').count(), 2);
    await page.locator('.person-card').nth(0).click();
    await page.locator('.person-card').nth(1).click();
    assert.match(await page.locator('#peopleMatchSummary').textContent(), /2 matching photos/);
    assert.equal(await page.locator('#mergePeopleButton').isVisible(), true);
    await page.click('#mergePeopleButton');
    await page.waitForSelector('#mergePeopleModal:not(.hidden)');
    assert.match(await page.locator('#mergePeopleDescription').textContent(), /Combine 2 groups/);
    await page.fill('#mergePersonName', 'Alex');
    await page.screenshot({ path: path.join(outputFolder, '10-human-correction.png') });
    await page.click('#confirmMergePeopleButton');
    await page.waitForFunction(() => document.querySelectorAll('.person-card').length === 1);
    assert.match(await page.locator('.person-card-copy span').textContent(), /Corrected match/);
    await page.evaluate(() => window.__kodTest.simulateManualCorrectionReload());
    assert.equal(await page.locator('.person-card').count(), 1);
    await page.click('.person-edit-button');
    assert.equal(await page.locator('#undoPersonMergeButton').isVisible(), true);
    await page.click('#undoPersonMergeButton');
    await page.waitForFunction(() => document.querySelectorAll('.person-card').length === 2);

    await page.locator('.person-card').nth(0).click();
    await page.locator('.person-card').nth(1).click();
    assert.match(await page.locator('#peopleMatchSummary').textContent(), /2 matching photos/);
    await page.click('#matchAllButton');
    assert.match(await page.locator('#peopleMatchSummary').textContent(), /1 matching photo/);
    await page.screenshot({ path: path.join(outputFolder, '10-people-selection.png') });

    await page.click('#sortMatchingButton');
    await page.waitForSelector('#triageScreen.active');
    assert.equal(await page.locator('#faceFilterBanner').isVisible(), true);
    assert.equal(await page.locator('#photoModeCount').textContent(), '1');
    assert.equal(await page.locator('#videoModeCount').textContent(), '0');
    assert.equal(await page.locator('#videoModeButton').isDisabled(), true);
    await page.screenshot({ path: path.join(outputFolder, '11-filtered-triage.png') });

    await page.keyboard.press('d');
    await page.waitForSelector('#peopleScreen.active');
    await page.click('.nav-button[data-route="review"]');
    await page.waitForSelector('#reviewScreen.active');
    assert.equal(await page.locator('.review-card').count(), 1);
    assert.deepEqual(pageErrors, []);
    console.log('Face smoke test passed: offline models, encrypted cache, reversible Same Person learning, Everyone matching, filtered triage, and Trash review.');
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
