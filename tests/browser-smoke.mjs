import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server = http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://127.0.0.1').pathname;
  let p = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(root,p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(4173,'127.0.0.1',r));

const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });

await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{role:'assistant',content:'SMOKE_OK'}}]})});
});
await page.route('http://127.0.0.1:4173/api/github/device/code', async route => {
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({device_code:'dev-smoke',user_code:'ABCD-EFGH',verification_uri:'https://github.com/login/device',expires_in:900,interval:5})});
});
await page.route('http://127.0.0.1:4173/api/github/device/token', async route => {
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({error:'authorization_pending'})});
});
await page.route('https://github.com/login/device', async route => {
  await route.fulfill({status:200,contentType:'text/html',body:'<title>GitHub device</title>'});
});

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.locator('summary').click();
await page.locator('#or').fill('smoke-key');
await page.locator('#webMode').selectOption('off');
await page.locator('#save').click();
await page.locator('#prompt').fill('hello');
await page.locator('#send').click();
await page.waitForFunction(()=>document.querySelector('#chat')?.textContent.includes('SMOKE_OK'),null,{timeout:10000});

await page.locator('#clientId').fill('Iv1.smoketestclient');
await page.locator('#ghLogin').click();
await page.waitForFunction(()=>document.querySelector('#deviceCode')?.textContent.includes('ABCD-EFGH'),null,{timeout:10000});

if(errors.length) throw new Error(errors.join('\n'));
console.log('Browser smoke test passed: chat + GitHub sign-in initiation');
await browser.close();
server.close();
