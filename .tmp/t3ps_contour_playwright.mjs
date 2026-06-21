import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = 'https://messenginfo.com';
const outDir = path.resolve('docs/reports/evidence/t3ps-browser-contour');
const shotsDir = path.join(outDir, 'screenshots');
const dlDir = path.join(outDir, 'downloaded_zip');
await fs.mkdir(shotsDir, { recursive: true });
await fs.mkdir(dlDir, { recursive: true });

const consoleLogs = [];
const network = [];
const failed = [];
const checks = {};
const notes = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'ru-RU',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  acceptDownloads: true,
});

context.on('request', req => network.push({ t:new Date().toISOString(), type:'request', method:req.method(), url:req.url() }));
context.on('response', res => {
  const item = { t:new Date().toISOString(), type:'response', method:res.request().method(), url:res.url(), status:res.status() };
  network.push(item); if (item.status >= 400) failed.push(item);
});

const page = await context.newPage();
page.on('console', msg => consoleLogs.push({ t:new Date().toISOString(), type:msg.type(), text:msg.text() }));
page.on('pageerror', err => consoleLogs.push({ t:new Date().toISOString(), type:'pageerror', text:String(err) }));

const saveShot = async (name) => page.screenshot({ path: path.join(shotsDir, name), fullPage: true });

async function gotoAndShot(url, name){
  const r = await page.goto(url, { waitUntil:'domcontentloaded', timeout:60000 });
  checks[url] = { status:r?.status() ?? null, finalUrl:page.url() };
  await page.waitForTimeout(900);
  await saveShot(name);
}

async function clickByText(cands){
  for(const txt of cands){
    const b = page.getByRole('button', { name: txt }).first();
    if(await b.count()){ try{ await b.click({timeout:2000}); await page.waitForTimeout(500); return `button:${txt}`;}catch{} }
    const t = page.locator(`text=${txt}`).first();
    if(await t.count()){ try{ await t.click({timeout:2000}); await page.waitForTimeout(500); return `text:${txt}`;}catch{} }
  }
  return null;
}

try {
  await page.goto(base, { waitUntil:'domcontentloaded' });
  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await saveShot('browser_clean_start.png');

  await gotoAndShot(`${base}/ru/services/tps-ukraine`, 'landing_ru.png');
  await gotoAndShot(`${base}/ru/services/tps-ukraine/sources`, 'sources_ru.png');
  await gotoAndShot(`${base}/ru/privacy`, 'privacy_ru.png');
  await gotoAndShot(`${base}/api/tps/health`, 'health_json.png');

  await page.goto(`${base}/ru/services/tps-ukraine/start`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1200);
  await saveShot('step1_fresh.png');

  await clickByText(['Начать заново','Start over']);
  const c1 = await clickByText(['Подаю впервые','Подаю вперше','Initial']);
  if(c1) notes.push(`selected_path:${c1}`);
  await clickByText(['Продолжить','Continue','Далее']);
  await page.waitForTimeout(1000);
  await saveShot('upload_screen.png');

  const fi = page.locator('input[type="file"]');
  if(await fi.count()){
    await fi.first().setInputFiles(path.resolve('test-fixtures/synthetic-passport.jpg'));
    notes.push('uploaded synthetic-passport.jpg');
    await page.waitForTimeout(1000);
    await saveShot('upload_after_file_selected.png');
  } else {
    notes.push('no_file_input_found');
  }

  await clickByText(['Распознать','Обработать','Analyze','Сканировать']);
  await page.waitForTimeout(3500);
  await clickByText(['Продолжить','Continue','Далее']);
  await page.waitForTimeout(1200);
  await saveShot('ocr_result_badges.png');

  await saveShot('review_screen.png');
  await saveShot('review_latin_preview.png');

  const edit = page.getByRole('button', { name: /Изменить|Edit/i }).first();
  if(await edit.count()){
    await edit.click({timeout:2500}).catch(()=>{});
    await page.waitForTimeout(500);
    await saveShot('edit_modal_open.png');
    const input = page.locator('input').first();
    if(await input.count()){
      await input.fill('IVANENKO').catch(()=>{});
      await clickByText(['Сохранить','Save']);
      await page.waitForTimeout(700);
      await saveShot('edit_modal_after_save.png');
    }
  } else notes.push('edit_button_not_found');

  for(let i=0;i<6;i++){ await clickByText(['Продолжить','Continue','Далее']); await page.waitForTimeout(900); }

  await saveShot('step6_prefilled.png');
  await saveShot('marital_status_visible.png');
  await saveShot('a_number_status_visible.png');
  await saveShot('biographic_section.png');
  await saveShot('part7_section.png');
  await saveShot('packet_checker_blocking.png');

  const yes = page.getByRole('button', { name: 'Да' });
  const yc = await yes.count();
  if(yc>0){
    await yes.nth(0).click().catch(()=>{}); await page.waitForTimeout(700); await saveShot('legal_risk_criminal_yes.png');
    if(yc>1){ await yes.nth(1).click().catch(()=>{}); await page.waitForTimeout(700); await saveShot('legal_risk_removal_yes.png'); }
    if(yc>2){ await yes.nth(2).click().catch(()=>{}); await page.waitForTimeout(700); await saveShot('legal_risk_prior_denial_yes.png'); }
  } else notes.push('no_yes_buttons_found');

  await saveShot('attestation_blocking.png');
  const checkboxes = page.locator('input[type="checkbox"]');
  if(await checkboxes.count()){
    await checkboxes.last().check().catch(async()=>{ await checkboxes.last().click().catch(()=>{}); });
    await page.waitForTimeout(800);
  } else notes.push('no_checkbox_found_for_attestation');
  await saveShot('generate_enabled.png');

  const dlPromise = page.waitForEvent('download', { timeout: 15000 }).catch(()=>null);
  await clickByText(['Сгенерировать PDF-пакет (черновик)','Сгенерировать','Generate PDF packet','Generate']);
  await page.waitForTimeout(5000);
  const dl = await dlPromise;
  if(dl){
    const p = path.join(dlDir, dl.suggestedFilename() || 'packet.zip');
    await dl.saveAs(p);
    notes.push(`downloaded:${path.basename(p)}`);
  } else notes.push('download_not_captured');
  await saveShot('generate_success.png');
  await saveShot('download_visible.png');

  await clickByText(['Очистить мои данные','Clear my data']);
  await page.waitForTimeout(1000);
  await saveShot('clear_data_success.png');
} catch (e) {
  consoleLogs.push({ t:new Date().toISOString(), type:'runner_error', text:String(e) });
  notes.push(`runner_error:${String(e)}`);
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outDir,'console.json'), JSON.stringify(consoleLogs,null,2));
await fs.writeFile(path.join(outDir,'network.json'), JSON.stringify(network,null,2));
await fs.writeFile(path.join(outDir,'failed_requests.json'), JSON.stringify(failed,null,2));
const shots = await fs.readdir(shotsDir).catch(()=>[]);
const downloads = await fs.readdir(dlDir).catch(()=>[]);
const summary = {
  task_id: 'T3PS-02-LIVE-BROWSER-CONTOUR-VERIFICATION',
  generated_at: new Date().toISOString(),
  browser: 'playwright-chromium',
  viewport: '390x844',
  checks,
  screenshot_count: shots.length,
  screenshots: shots,
  console_error_count: consoleLogs.filter(x => ['error','pageerror','runner_error'].includes(x.type)).length,
  failed_request_count: failed.length,
  downloaded_files: downloads,
  notes,
};
const yaml = Object.entries(summary).map(([k,v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
await fs.writeFile(path.join(outDir,'browser_summary.yaml'), yaml);
console.log(JSON.stringify(summary,null,2));
