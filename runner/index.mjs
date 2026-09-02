import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map(x => {
  const i = x.indexOf('='); return i > 0 ? [x.slice(0, i).replace(/^--/, ''), x.slice(i + 1)] : [x.replace(/^--/, ''), 'true'];
}));
const server = (args.server || process.env.FORGECODEX_SERVER || 'https://forgecodex.mct-official.com').replace(/\/$/, '');
const room = args.room || process.env.FORGECODEX_ROOM;
const secret = args.secret || process.env.FORGECODEX_SECRET;
const workspace = path.resolve(args.workspace || process.env.FORGECODEX_WORKSPACE || process.cwd());
if (!room || !secret || secret.length < 8) {
  console.error('Usage: npm start -- --room=123456 --secret=YOUR_SECRET --workspace=C:\\path\\project');
  process.exit(2);
}
if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
  console.error('Workspace does not exist:', workspace); process.exit(2);
}
const wsUrl = server.replace(/^http/, 'ws') + `/relay/${encodeURIComponent(room)}?role=runner&secret=${encodeURIComponent(secret)}`;
const blocked = [
  /(^|[;&|]\s*)sudo\b/i, /(^|[;&|]\s*)su\s/i, /\bshutdown\b/i, /\breboot\b/i,
  /\bmkfs(\.|\s)/i, /\bformat\s+[a-z]:/i, /\bdiskpart\b/i, /\bdd\s+.*\bof=\/dev\//i,
  /rm\s+-rf\s+\/(\s|$)/i, /del\s+\/s\s+\/q\s+[a-z]:\\/i
];
function insideWorkspace(p) {
  const resolved = path.resolve(workspace, p || '.');
  return resolved === workspace || resolved.startsWith(workspace + path.sep);
}
function shell() { return process.platform === 'win32' ? { cmd: 'cmd.exe', args: ['/d', '/s', '/c'] } : { cmd: '/bin/bash', args: ['-lc'] }; }
function connect() {
  console.log(`Connecting to ${server} room ${room}...`);
  const ws = new WebSocket(wsUrl);
  ws.on('open', () => {
    console.log('ForgeCodex Runner connected.');
    ws.send(JSON.stringify({ type: 'runner_status', online: true, platform: process.platform, arch: process.arch, hostname: os.hostname(), workspace }));
  });
  ws.on('message', async buf => {
    let m; try { m = JSON.parse(String(buf)); } catch { return; }
    if (m.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', id: m.id }));
    if (m.type !== 'exec') return;
    const id = String(m.id || crypto.randomUUID());
    const command = String(m.command || '').trim();
    const cwdRel = String(m.cwd || '.');
    if (!command) return;
    if (!insideWorkspace(cwdRel)) return ws.send(JSON.stringify({ type: 'exec_result', id, ok: false, error: 'cwd escapes workspace' }));
    if (blocked.some(r => r.test(command))) return ws.send(JSON.stringify({ type: 'exec_result', id, ok: false, error: 'command blocked by runner safety policy' }));
    const cwd = path.resolve(workspace, cwdRel);
    const timeout = Math.min(Math.max(Number(m.timeout || 120000), 1000), 600000);
    const sh = shell();
    const child = spawn(sh.cmd, [...sh.args, command], { cwd, env: { ...process.env, CI: process.env.CI || '1' }, windowsHide: true });
    let stdout = '', stderr = '', killed = false;
    const cap = 1024 * 1024;
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-cap); ws.send(JSON.stringify({ type: 'exec_stream', id, stream: 'stdout', data: String(d).slice(0, 32768) })); });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-cap); ws.send(JSON.stringify({ type: 'exec_stream', id, stream: 'stderr', data: String(d).slice(0, 32768) })); });
    const timer = setTimeout(() => { killed = true; child.kill(); }, timeout);
    child.on('close', code => {
      clearTimeout(timer);
      ws.send(JSON.stringify({ type: 'exec_result', id, ok: code === 0 && !killed, code, killed, stdout, stderr, cwd: cwdRel }));
    });
  });
  ws.on('close', () => { console.log('Disconnected; reconnecting in 3s...'); setTimeout(connect, 3000); });
  ws.on('error', e => console.error('Runner socket:', e.message));
}
connect();
