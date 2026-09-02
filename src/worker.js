export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/relay/')) {
      const room = url.pathname.slice('/relay/'.length).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      if (!room) return new Response('room required', { status: 400 });
      const id = env.RUNNER_RELAY.idFromName(room);
      return env.RUNNER_RELAY.get(id).fetch(request);
    }
    if (url.pathname === '/api/health') return Response.json({ ok: true, service: 'forgecodex', relay: true });
    return env.ASSETS.fetch(request);
  }
};

export class RunnerRelay {
  constructor(state) {
    this.state = state;
    this.sockets = new Set();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const url = new URL(request.url);
    const role = url.searchParams.get('role') === 'runner' ? 'runner' : 'client';
    const secret = (url.searchParams.get('secret') || '').slice(0, 128);
    if (!secret || secret.length < 8) return new Response('secret required', { status: 401 });

    const stored = await this.state.storage.get('secret');
    if (!stored) await this.state.storage.put('secret', secret);
    else if (stored !== secret) return new Response('pairing secret mismatch', { status: 403 });

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    server.role = role;
    this.sockets.add(server);

    server.addEventListener('message', event => {
      const raw = typeof event.data === 'string' ? event.data : '';
      if (!raw || raw.length > 1024 * 1024) return;
      for (const ws of this.sockets) {
        if (ws === server || ws.readyState !== 1) continue;
        if (role === 'runner' && ws.role === 'client') ws.send(raw);
        if (role === 'client' && ws.role === 'runner') ws.send(raw);
      }
    });
    const cleanup = () => this.sockets.delete(server);
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    const peers = [...this.sockets].filter(ws => ws !== server && ws.readyState === 1).map(ws => ws.role);
    server.send(JSON.stringify({ type: 'relay_ready', role, runnerOnline: peers.includes('runner') }));
    return new Response(null, { status: 101, webSocket: client });
  }
}
