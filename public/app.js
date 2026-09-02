const $ = (selector) => document.querySelector(selector);
const SETTINGS_KEY = 'forgecodex_settings_v5';
const HISTORY_KEY = 'forgecodex_history_v2';
const MEMORY_KEY = 'forgecodex_memory_v1';

var tools = [];
let hist = [];
let lastDiff = '';

const FREE_MODELS = {
  'openrouter/free': 'Auto Free',
  'z-ai/glm-5.2:free': 'GLM-5.2 Free',
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'Nemotron 3 Ultra Free',
  'minimax/minimax-m2.7:free': 'MiniMax M2.7 Free',
  'thinkingmachines/inkling:free': 'Inkling Free'
};

function settings() {
  const keys = [SETTINGS_KEY, 'forgecodex_settings_v4', 'forgecodex_settings_v3', 'forgecodex_settings_v2'];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
  }
  return {};
}

function putSettings(patch) {
  const value = { ...settings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  return value;
}

function selectedModel() {
  const s = settings();
  const choice = $('#model')?.value || s.modelChoice || s.model || 'openrouter/free';
  if (choice === '__custom__') return ($('#customModel')?.value || s.customModel || '').trim();
  return choice;
}

function webMode() {
  const s = settings();
  return $('#webMode')?.value || s.webMode || (s.webSearch ? 'always' : 'auto');
}

function agentMode() {
  return $('#agentMode')?.value || settings().agentMode || 'agent';
}

function memory() {
  return localStorage.getItem(MEMORY_KEY) || '';
}

function hasGitHub() {
  return Boolean(settings().ghToken);
}

function modelLabel() {
  const model = selectedModel() || 'openrouter/free';
  return FREE_MODELS[model] || model;
}

function modeLabel() {
  const gh = hasGitHub() ? 'GitHub ' : '';
  return `${gh}${agentMode()} · ${modelLabel()} · Web:${webMode()}`;
}

function setStatus(text) {
  const el = $('#status');
  if (el) el.textContent = text;
}

function add(kind, text) {
  const chat = $('#chat');
  if (!chat) return;
  const item = document.createElement('div');
  item.className = `msg ${kind}`;
  const value = String(text ?? '');
  const linkRe = /(https?:\/\/[^\s<>]+)/g;
  let last = 0;
  let match;
  while ((match = linkRe.exec(value))) {
    if (match.index > last) item.append(document.createTextNode(value.slice(last, match.index)));
    const a = document.createElement('a');
    a.href = match[0].replace(/[),.;]+$/, '');
    a.textContent = a.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    item.append(a);
    last = match.index + match[0].length;
  }
  if (last < value.length) item.append(document.createTextNode(value.slice(last)));
  chat.append(item);
  item.scrollIntoView({ block: 'end' });
}

function showErr(error) {
  const message = error?.message || String(error);
  setStatus(`Error: ${message}`);
  add('err', `Error: ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function persistHist() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-40)));
}

function loadHist() {
  try {
    hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(hist)) hist = [];
  } catch (_) {
    hist = [];
  }
}

function b64enc(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64dec(value) {
  const binary = atob(String(value || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function escPath(path) {
  return String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function active() {
  const value = $('#repo')?.value || '';
  const slash = value.indexOf('/');
  return {
    owner: slash >= 0 ? value.slice(0, slash) : '',
    repo: slash >= 0 ? value.slice(slash + 1) : '',
    ref: $('#branch')?.value || 'main'
  };
}

async function gh(path, options = {}) {
  const token = settings().ghToken;
  if (!token) throw new Error('GitHubにサインインしてください');
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`https://api.github.com${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    if (response.status === 401) putSettings({ ghToken: '' });
    throw new Error(data?.message || `GitHub ${response.status}`);
  }
  return data;
}

function openExternal(url) {
  try {
    if (window.ForgeCodexAndroid?.openExternal) {
      window.ForgeCodexAndroid.openExternal(url);
      return;
    }
  } catch (_) {}
  const popup = window.open(url, '_blank', 'noopener');
  if (!popup) location.href = url;
}

async function githubLogin() {
  const clientId = ($('#clientId')?.value || settings().clientId || '').trim();
  if (!clientId) {
    const details = document.querySelector('details.settings');
    if (details) details.open = true;
    $('#clientId')?.focus();
    throw new Error('GitHub OAuth Client IDを入力してからSign inしてください');
  }
  putSettings({ clientId });
  setStatus('GitHub認証コードを取得中…');
  const response = await fetch('/api/github/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId })
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error_description || data.error || `GitHub ${response.status}`);

  const box = $('#deviceBox');
  const code = $('#deviceCode');
  const link = $('#deviceLink');
  if (code) code.textContent = data.user_code || '';
  if (link) link.href = data.verification_uri || 'https://github.com/login/device';
  if (box) box.classList.remove('hidden');
  setStatus(`GitHubコード: ${data.user_code}`);
  openExternal(data.verification_uri || 'https://github.com/login/device');

  let interval = Math.max(5, Number(data.interval) || 5);
  const deadline = Date.now() + (Number(data.expires_in) || 900) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    const tokenResponse = await fetch('/api/github/device/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, device_code: data.device_code })
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.access_token) {
      putSettings({ ghToken: tokenData.access_token });
      if (box) box.classList.add('hidden');
      await updateGitHubUI();
      await loadRepos();
      return;
    }
    if (tokenData.error === 'authorization_pending') continue;
    if (tokenData.error === 'slow_down') { interval += 5; continue; }
    if (tokenData.error === 'expired_token') throw new Error('GitHub認証コードの期限が切れました');
    if (tokenData.error === 'access_denied') throw new Error('GitHub認証がキャンセルされました');
    if (!tokenResponse.ok || tokenData.error) throw new Error(tokenData.error_description || tokenData.error || `GitHub ${tokenResponse.status}`);
  }
  throw new Error('GitHub認証コード期限切れ');
}

async function githubLogout() {
  putSettings({ ghToken: '' });
  if ($('#repo')) $('#repo').innerHTML = '';
  if ($('#branch')) $('#branch').innerHTML = '';
  await updateGitHubUI();
}

async function updateGitHubUI() {
  const disabled = !hasGitHub();
  const ids = ['repo','branch','reload','open','tree','commit','deleteFile','moveFile','branchCreate','showDiff','prCreate','listPRs','reviewDiff','undoLast','loadIssues','createIssue','loadActions','runJobs','loadAgents'];
  for (const id of ids) {
    const el = $(`#${id}`);
    if (el) el.disabled = disabled;
  }
  const login = $('#ghLogin');
  const logout = $('#ghLogout');
  const user = $('#ghUser');
  if (disabled) {
    if (user) user.textContent = 'GitHub: 未ログイン（Chatは利用可能）';
    login?.classList.remove('hidden');
    logout?.classList.add('hidden');
  } else {
    try {
      const me = await gh('/user');
      if (user) user.textContent = `GitHub: @${me.login} · Agent有効`;
      login?.classList.add('hidden');
      logout?.classList.remove('hidden');
    } catch (error) {
      if (user) user.textContent = 'GitHub: 再ログインが必要';
    }
  }
  setStatus(modeLabel());
}

async function loadRepos() {
  if (!hasGitHub()) return;
  setStatus('Loading repos…');
  const repos = await gh('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member');
  const repoSelect = $('#repo');
  if (repoSelect) repoSelect.innerHTML = repos.map((r) => `<option>${r.full_name}</option>`).join('');
  await loadBranches();
  setStatus(modeLabel());
}

async function loadBranches() {
  const repo = active();
  if (!repo.owner) return;
  const branches = await gh(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/branches?per_page=100`);
  const branch = $('#branch');
  if (branch) branch.innerHTML = branches.map((b) => `<option>${b.name}</option>`).join('');
  const base = $('#baseBranch');
  if (base) base.value = branches.some((b) => b.name === 'main') ? 'main' : (branches[0]?.name || 'main');
}

async function getFile(path, ref) {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/contents/${escPath(path)}?ref=${encodeURIComponent(ref || repo.ref)}`);
}

async function writeFile(path, content, message, branch) {
  const repo = active();
  const target = branch || repo.ref;
  let current = null;
  try { current = await getFile(path, target); } catch (_) {}
  const body = {
    message: message || `Update ${path} via ForgeCodex`,
    content: b64enc(content),
    branch: target
  };
  if (current?.sha) body.sha = current.sha;
  return gh(`/repos/${repo.owner}/${repo.repo}/contents/${escPath(path)}`, { method: 'PUT', body: JSON.stringify(body) });
}

async function deleteFile(path, message, branch) {
  const repo = active();
  const target = branch || repo.ref;
  const current = await getFile(path, target);
  return gh(`/repos/${repo.owner}/${repo.repo}/contents/${escPath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: message || `Delete ${path} via ForgeCodex`, sha: current.sha, branch: target })
  });
}

async function moveFile(from, to, message, branch) {
  const repo = active();
  const target = branch || repo.ref;
  const current = await getFile(from, target);
  await writeFile(to, b64dec(current.content), message || `Move ${from} to ${to}`, target);
  await deleteFile(from, message || `Remove ${from}`, target);
}

async function listTree(ref) {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(ref || repo.ref)}?recursive=1`);
}

async function createBranch(name, from) {
  const repo = active();
  const source = await gh(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(from || repo.ref)}`);
  return gh(`/repos/${repo.owner}/${repo.repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${name}`, sha: source.object.sha })
  });
}

async function compareRefs(base, head) {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
}

async function createPR(title, head, base, body = '') {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, head, base: base || 'main', body })
  });
}

async function listPRs() {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/pulls?state=open&per_page=50`);
}

async function listIssues() {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/issues?state=open&per_page=50`);
}

async function createIssue(title, body = '') {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/issues`, { method: 'POST', body: JSON.stringify({ title, body }) });
}

async function listActions() {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/actions/runs?per_page=30`);
}

async function actionJobs(id) {
  const repo = active();
  return gh(`/repos/${repo.owner}/${repo.repo}/actions/runs/${encodeURIComponent(id)}/jobs?per_page=100`);
}

async function getAgents() {
  try { return b64dec((await getFile('AGENTS.md')).content).slice(0, 30000); }
  catch (_) { return ''; }
}

async function undoLastCommit() {
  const repo = active();
  const ref = await gh(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(repo.ref)}`);
  const commit = await gh(`/repos/${repo.owner}/${repo.repo}/git/commits/${ref.object.sha}`);
  const parent = commit.parents?.[0]?.sha;
  if (!parent) throw new Error('親コミットがありません');
  return gh(`/repos/${repo.owner}/${repo.repo}/git/refs/heads/${encodeURIComponent(repo.ref)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: parent, force: true })
  });
}

function webTools() {
  return [
    { type: 'openrouter:web_search', parameters: { engine: 'parallel', max_results: 5, max_total_results: 10, search_context_size: 'low' } },
    { type: 'openrouter:web_fetch', parameters: { engine: 'openrouter', max_content_tokens: 12000 } }
  ];
}

async function requestOpenRouter(messages, toolList, includeWeb) {
  const s = settings();
  const model = selectedModel() || s.model || 'openrouter/free';
  if (!s.or) throw new Error('OpenRouter API key required');
  const body = { model, messages };
  const allTools = [...(toolList || [])];
  if (includeWeb) allTools.push(...webTools());
  if (allTools.length) {
    body.tools = allTools;
    body.tool_choice = 'auto';
  }
  if (webMode() === 'always') body.plugins = [{ id: 'web', engine: 'parallel', mode: 'turbo', max_results: 5 }];
  if (model.startsWith('z-ai/glm-5.2')) body.reasoning = { effort: 'high' };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.or}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': location.origin,
      'X-Title': 'ForgeCodex'
    },
    body: JSON.stringify(body)
  });
  let data;
  try { data = await response.json(); } catch (_) { throw new Error(`OpenRouter ${response.status}`); }
  if (!response.ok) throw new Error(data?.error?.message || `OpenRouter ${response.status}`);
  return data;
}

async function orChat(messages, toolList = []) {
  const useAgenticWeb = webMode() === 'auto';
  try {
    return await requestOpenRouter(messages, toolList, useAgenticWeb);
  } catch (error) {
    if (!useAgenticWeb) throw error;
    setStatus('Webなしで再試行…');
    return requestOpenRouter(messages, toolList, false);
  }
}

function withCitations(message) {
  let out = message?.content || '';
  const annotations = (message?.annotations || []).filter((a) => a?.type === 'url_citation' && a.url_citation?.url);
  const seen = new Set();
  const sources = [];
  for (const a of annotations) {
    const url = a.url_citation.url;
    if (seen.has(url)) continue;
    seen.add(url);
    sources.push(`${a.url_citation.title || 'Source'}: ${url}`);
  }
  if (sources.length) out += `\n\nSources:\n${sources.join('\n')}`;
  return out;
}

function ghTools(readOnly = false) {
  const base = [
    { type: 'function', function: { name: 'list_tree', description: 'List repository files recursively', parameters: { type: 'object', properties: { ref: { type: 'string' } } } } },
    { type: 'function', function: { name: 'read_file', description: 'Read a repository text file', parameters: { type: 'object', properties: { path: { type: 'string' }, ref: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'compare_refs', description: 'Compare two refs', parameters: { type: 'object', properties: { base: { type: 'string' }, head: { type: 'string' } }, required: ['base', 'head'] } } },
    { type: 'function', function: { name: 'list_issues', description: 'List open issues', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'list_prs', description: 'List open pull requests', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'list_actions', description: 'List recent GitHub Actions runs', parameters: { type: 'object', properties: {} } } }
  ];
  if (readOnly) return base;
  return base.concat([
    { type: 'function', function: { name: 'write_file', description: 'Create or update a UTF-8 text file and commit it', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' }, branch: { type: 'string' } }, required: ['path', 'content'] } } },
    { type: 'function', function: { name: 'delete_file', description: 'Delete a repository file and commit it', parameters: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' }, branch: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'move_file', description: 'Move or rename a UTF-8 repository file', parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, message: { type: 'string' }, branch: { type: 'string' } }, required: ['from', 'to'] } } },
    { type: 'function', function: { name: 'create_branch', description: 'Create a branch', parameters: { type: 'object', properties: { branch: { type: 'string' }, from: { type: 'string' } }, required: ['branch'] } } },
    { type: 'function', function: { name: 'create_pr', description: 'Create a pull request', parameters: { type: 'object', properties: { title: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'head'] } } },
    { type: 'function', function: { name: 'create_issue', description: 'Create a GitHub issue', parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title'] } } },
    ...tools
  ]);
}

async function execTool(name, args) {
  if (name === 'list_tree') {
    const data = await listTree(args.ref);
    return { tree: (data.tree || []).filter((x) => x.type === 'blob').slice(0, 4000).map((x) => x.path), truncated: data.truncated };
  }
  if (name === 'read_file') {
    const data = await getFile(args.path, args.ref);
    return { path: args.path, sha: data.sha, content: b64dec(data.content).slice(0, 100000) };
  }
  if (name === 'write_file') {
    const data = await writeFile(args.path, args.content, args.message, args.branch);
    return { commit: data.commit?.sha, path: args.path };
  }
  if (name === 'delete_file') {
    const data = await deleteFile(args.path, args.message, args.branch);
    return { commit: data.commit?.sha, path: args.path };
  }
  if (name === 'move_file') {
    await moveFile(args.from, args.to, args.message, args.branch);
    return { from: args.from, to: args.to };
  }
  if (name === 'create_branch') {
    const data = await createBranch(args.branch, args.from);
    return { ref: data.ref, sha: data.object?.sha };
  }
  if (name === 'create_pr') {
    const data = await createPR(args.title, args.head, args.base, args.body);
    return { number: data.number, url: data.html_url };
  }
  if (name === 'compare_refs') {
    const data = await compareRefs(args.base, args.head);
    return { status: data.status, ahead_by: data.ahead_by, behind_by: data.behind_by, files: (data.files || []).map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch })) };
  }
  if (name === 'list_issues') return (await listIssues()).filter((x) => !x.pull_request).map((x) => ({ number: x.number, title: x.title, url: x.html_url }));
  if (name === 'create_issue') {
    const data = await createIssue(args.title, args.body);
    return { number: data.number, url: data.html_url };
  }
  if (name === 'list_prs') return (await listPRs()).map((x) => ({ number: x.number, title: x.title, head: x.head?.ref, base: x.base?.ref, url: x.html_url }));
  if (name === 'list_actions') {
    const data = await listActions();
    return (data.workflow_runs || []).slice(0, 20).map((x) => ({ id: x.id, name: x.name, status: x.status, conclusion: x.conclusion, branch: x.head_branch, url: x.html_url }));
  }
  return { error: `Unknown tool: ${name}` };
}

async function tool(name, args) {
  return execTool(name, args);
}

async function runChat(text) {
  const system = `You are ForgeCodex, a coding assistant. GitHub is not connected. Never claim repository access or edits. Web mode: ${webMode()}. Project memory:\n${memory()}`;
  const response = await orChat([{ role: 'system', content: system }, ...hist, { role: 'user', content: text }], []);
  const message = response.choices?.[0]?.message;
  if (!message) throw new Error('No model response');
  const out = withCitations(message);
  hist.push({ role: 'user', content: text }, { role: 'assistant', content: message.content || out });
  persistHist();
  return out;
}

async function runGitHubAgent(text, forcedMode) {
  const repo = active();
  const mode = forcedMode || agentMode();
  if (!repo.owner) throw new Error('リポジトリを選択してください');
  const agents = await getAgents();
  const readOnly = mode !== 'agent';
  const system = `You are ForgeCodex, an autonomous coding agent. Repository: ${repo.owner}/${repo.repo}. Branch: ${repo.ref}. Mode: ${mode}. ${readOnly ? 'READ ONLY. Do not modify repository.' : 'Inspect before editing. Make coherent changes and verify with available evidence.'} Web mode: ${webMode()}.\nProject memory:\n${memory()}\n\nAGENTS.md:\n${agents || '(none)'}`;
  const messages = [{ role: 'system', content: system }, ...hist, { role: 'user', content: text }];
  const availableTools = ghTools(readOnly);

  for (let step = 0; step < 24; step += 1) {
    setStatus(`${modelLabel()} · ${mode} ${step + 1}/24`);
    const response = await orChat(messages, availableTools);
    const message = response.choices?.[0]?.message;
    if (!message) throw new Error('No model response');
    messages.push(message);
    const calls = (message.tool_calls || []).filter((call) => call?.function?.name);
    if (!calls.length) {
      const out = withCitations(message);
      hist.push({ role: 'user', content: text }, { role: 'assistant', content: message.content || out });
      persistHist();
      setStatus(modeLabel());
      return out;
    }
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch (_) {}
      let result;
      try { result = await tool(call.function.name, args); }
      catch (error) { result = { error: error?.message || String(error) }; }
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result).slice(0, 120000) });
    }
  }
  throw new Error('Agent step limit reached (24)');
}

async function run(text) {
  return hasGitHub() ? runGitHubAgent(text) : runChat(text);
}

function saveSettings() {
  const choice = $('#model')?.value || 'openrouter/free';
  const custom = $('#customModel')?.value.trim() || '';
  if (choice === '__custom__' && !custom) throw new Error('Custom model IDを入力してください');
  putSettings({
    or: $('#or')?.value.trim() || '',
    modelChoice: choice,
    customModel: custom,
    model: selectedModel(),
    webMode: webMode(),
    agentMode: agentMode(),
    clientId: $('#clientId')?.value.trim() || ''
  });
  setStatus(modeLabel());
}

async function renderDiff() {
  const base = $('#baseBranch')?.value.trim() || 'main';
  const head = $('#branch')?.value || active().ref;
  const data = await compareRefs(base, head);
  lastDiff = (data.files || []).map((f) => `### ${f.status} ${f.filename} +${f.additions} -${f.deletions}\n${f.patch || '(binary/no patch)'}`).join('\n\n');
  if ($('#gitout')) $('#gitout').textContent = `${data.status} · ahead ${data.ahead_by} / behind ${data.behind_by}\n\n${lastDiff || 'No changes'}`;
  return lastDiff;
}

function bindUI() {
  $('#save').onclick = () => { try { saveSettings(); } catch (error) { showErr(error); } };
  $('#ghLogin').onclick = () => githubLogin().catch(showErr);
  $('#ghLogout').onclick = () => githubLogout().catch(showErr);
  $('#model').onchange = () => {
    $('#customModel')?.classList.toggle('hidden', $('#model').value !== '__custom__');
    try { saveSettings(); } catch (error) { showErr(error); }
  };
  $('#webMode').onchange = () => { try { saveSettings(); } catch (error) { showErr(error); } };
  $('#agentMode').onchange = () => { try { saveSettings(); } catch (error) { showErr(error); } };
  $('#repo').onchange = () => loadBranches().catch(showErr);
  $('#reload').onclick = () => loadRepos().catch(showErr);

  $('#send').onclick = async () => {
    const prompt = $('#prompt');
    const text = prompt?.value.trim();
    if (!text) return;
    prompt.value = '';
    add('u', text);
    $('#send').disabled = true;
    try { add('a', await run(text)); }
    catch (error) { showErr(error); }
    finally { $('#send').disabled = false; }
  };
  $('#clear').onclick = () => { hist = []; persistHist(); if ($('#chat')) $('#chat').innerHTML = ''; };

  $('#open').onclick = async () => {
    try {
      const data = await getFile($('#path').value.trim());
      $('#editor').value = b64dec(data.content);
      $('#fileout').textContent = `${data.path} · ${data.sha}`;
    } catch (error) { showErr(error); }
  };
  $('#tree').onclick = async () => {
    try {
      const data = await listTree();
      $('#fileout').textContent = (data.tree || []).filter((x) => x.type === 'blob').map((x) => x.path).join('\n');
    } catch (error) { showErr(error); }
  };
  $('#commit').onclick = async () => {
    try {
      const data = await writeFile($('#path').value.trim(), $('#editor').value, $('#msg').value.trim());
      $('#fileout').textContent = `Committed ${data.commit?.sha || ''}`;
    } catch (error) { showErr(error); }
  };
  $('#deleteFile').onclick = async () => {
    try {
      const path = $('#path').value.trim();
      if (!path || !confirm(`Delete ${path}?`)) return;
      await deleteFile(path, $('#msg').value.trim());
      $('#editor').value = '';
      $('#fileout').textContent = `Deleted ${path}`;
    } catch (error) { showErr(error); }
  };
  $('#moveFile').onclick = async () => {
    try {
      const from = $('#path').value.trim();
      const to = $('#movePath').value.trim();
      if (!from || !to) throw new Error('移動元/先pathが必要です');
      await moveFile(from, to, $('#msg').value.trim());
      $('#path').value = to;
      $('#fileout').textContent = `Moved ${from} → ${to}`;
    } catch (error) { showErr(error); }
  };

  $('#branchCreate').onclick = async () => {
    try {
      const name = $('#newBranch').value.trim();
      if (!name) throw new Error('Branch名を入力してください');
      await createBranch(name);
      await loadBranches();
      $('#branch').value = name;
      $('#gitout').textContent = `Created ${name}`;
    } catch (error) { showErr(error); }
  };
  $('#showDiff').onclick = () => renderDiff().catch(showErr);
  $('#prCreate').onclick = async () => {
    try {
      const data = await createPR($('#prTitle').value.trim() || 'ForgeCodex changes', $('#branch').value, $('#baseBranch').value.trim() || 'main', 'Created by ForgeCodex');
      $('#gitout').textContent = `PR #${data.number}\n${data.html_url}`;
    } catch (error) { showErr(error); }
  };
  $('#listPRs').onclick = async () => {
    try { $('#gitout').textContent = (await listPRs()).map((x) => `#${x.number} ${x.title}\n${x.head.ref} → ${x.base.ref}\n${x.html_url}`).join('\n\n') || 'No open PRs'; }
    catch (error) { showErr(error); }
  };
  $('#reviewDiff').onclick = async () => {
    try {
      const diff = await renderDiff();
      if (!diff) throw new Error('差分なし');
      add('u', '現在のbranch差分をレビューして');
      add('a', await runGitHubAgent('現在のbranchとbaseの差分を読み、重大度順にレビューしてください。変更はしないでください。', 'review'));
    } catch (error) { showErr(error); }
  };
  $('#undoLast').onclick = async () => {
    try {
      if (!confirm('現在のbranchを1コミット前へ戻します。続行しますか？')) return;
      const data = await undoLastCommit();
      $('#gitout').textContent = `Branch moved to ${data.object.sha}`;
    } catch (error) { showErr(error); }
  };

  $('#loadIssues').onclick = async () => {
    try { $('#issueout').textContent = (await listIssues()).filter((x) => !x.pull_request).map((x) => `#${x.number} ${x.title}\n${x.html_url}`).join('\n\n') || 'No open issues'; }
    catch (error) { showErr(error); }
  };
  $('#createIssue').onclick = async () => {
    try {
      const data = await createIssue($('#issueTitle').value.trim(), $('#issueBody').value);
      $('#issueout').textContent = `Created #${data.number}\n${data.html_url}`;
    } catch (error) { showErr(error); }
  };

  $('#loadActions').onclick = async () => {
    try {
      const data = await listActions();
      $('#actionout').textContent = (data.workflow_runs || []).map((x) => `${x.id} · ${x.name}\n${x.status}/${x.conclusion || '-'} · ${x.head_branch}\n${x.html_url}`).join('\n\n') || 'No runs';
    } catch (error) { showErr(error); }
  };
  $('#runJobs').onclick = async () => {
    try {
      const data = await actionJobs($('#runId').value.trim());
      $('#actionout').textContent = (data.jobs || []).map((j) => `${j.id} · ${j.name}\n${j.status}/${j.conclusion || '-'}\n${(j.steps || []).map((s) => `  ${s.number}. ${s.name}: ${s.status}/${s.conclusion || '-'}`).join('\n')}`).join('\n\n') || 'No jobs';
    } catch (error) { showErr(error); }
  };

  $('#saveMemory').onclick = () => {
    localStorage.setItem(MEMORY_KEY, $('#projectMemory').value);
    $('#projectout').textContent = 'Saved locally';
  };
  $('#loadAgents').onclick = async () => {
    try { $('#projectout').textContent = (await getAgents()) || 'AGENTS.md not found'; }
    catch (error) { showErr(error); }
  };

  for (const button of document.querySelectorAll('nav button[data-tab]')) {
    button.onclick = () => {
      for (const b of document.querySelectorAll('nav button[data-tab]')) b.classList.toggle('active', b === button);
      for (const tab of document.querySelectorAll('.tab')) tab.classList.add('hidden');
      $(`#${button.dataset.tab}Tab`)?.classList.remove('hidden');
    };
  }

  const deviceLink = $('#deviceLink');
  if (deviceLink) deviceLink.onclick = (event) => { event.preventDefault(); openExternal(deviceLink.href); };
}

function init() {
  loadHist();
  const s = settings();
  if ($('#or')) $('#or').value = s.or || '';
  if ($('#model')) $('#model').value = s.modelChoice || s.model || 'openrouter/free';
  if ($('#customModel')) {
    $('#customModel').value = s.customModel || '';
    $('#customModel').classList.toggle('hidden', $('#model')?.value !== '__custom__');
  }
  if ($('#webMode')) $('#webMode').value = s.webMode || 'auto';
  if ($('#agentMode')) $('#agentMode').value = s.agentMode || 'agent';
  if ($('#clientId')) $('#clientId').value = s.clientId || '';
  if ($('#projectMemory')) $('#projectMemory').value = memory();
  bindUI();
  updateGitHubUI().then(() => { if (hasGitHub()) return loadRepos(); }).catch(showErr);
  setStatus(modeLabel());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
