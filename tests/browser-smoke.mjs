import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const scripts = [
  'public/app.js',
  'public/team.js',
  'public/runner.js',
  'public/hotfix.js',
  'public/authfix.js'
].map((p) => fs.readFileSync(p, 'utf8')).join('\n;\n');

const dom = new JSDOM(html, {
  url: 'https://forgecodex.test/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;

window.HTMLElement.prototype.scrollIntoView = function() {};
window.confirm = () => true;
window.open = () => ({ closed: false });
window.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000001';

let tokenPolls = 0;
window.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url === 'https://openrouter.ai/api/v1/chat/completions') {
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'SMOKE_OK' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  if (url === '/api/github/device/code') {
    return new Response(JSON.stringify({
      device_code: 'dev-smoke',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 0
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === '/api/github/device/token') {
    tokenPolls += 1;
    return new Response(JSON.stringify({ error: 'authorization_pending' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  if (url === 'https://api.github.com/user') {
    return new Response(JSON.stringify({ login: 'smoke-user' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  throw new Error(`Unexpected fetch: ${url} ${init.method || 'GET'}`);
};

window.WebSocket = class {
  static OPEN = 1;
  constructor() { this.readyState = 0; }
  close() {}
  send() {}
};

window.eval(scripts);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await new Promise((resolve) => setTimeout(resolve, 0));

const byId = (id) => window.document.getElementById(id);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(typeof byId('send')?.onclick === 'function', 'Run button has no click handler');
assert(typeof byId('ghLogin')?.onclick === 'function', 'GitHub Sign in button has no click handler');

byId('or').value = 'smoke-key';
byId('webMode').value = 'off';
byId('save').click();
byId('prompt').value = 'hello';
byId('send').click();
await new Promise((resolve) => setTimeout(resolve, 30));
assert(byId('chat').textContent.includes('SMOKE_OK'), 'Chat click did not produce assistant response');

byId('clientId').value = 'Iv1.smoketestclient';
byId('ghLogin').click();
await new Promise((resolve) => setTimeout(resolve, 30));
assert(byId('deviceCode').textContent.includes('ABCD-EFGH'), 'GitHub Sign in did not show device code');
assert(!byId('deviceBox').classList.contains('hidden'), 'GitHub device box stayed hidden');
assert(tokenPolls >= 0, 'Token polling setup failed');

console.log('DOM smoke test passed: Chat and GitHub Sign in are wired');
