# ForgeCodex PC Runner

PC Runner lets ForgeCodex on Web, iPad, or Android use the shell/build/test environment on your PC while the Runner is running.

## How it connects

The PC opens an outbound WebSocket to `forgecodex.mct-official.com`. The browser/APK opens another WebSocket to the same Cloudflare relay. No inbound port forwarding, fixed IP, or LAN access is required.

Pairing uses:
- a 6-digit room
- a long random secret

Do not share the pairing secret.

## Windows

1. Install Node.js 20 or later if it is not installed.
2. Open ForgeCodex -> Project -> PC Runner / Sandbox.
3. Note the generated Pairing room and Pairing secret.
4. Run `start-windows.bat` in this folder.
5. Enter the same room and secret.
6. Enter the full path of the local project/workspace ForgeCodex may operate in.
7. Keep the Runner window open.

## Linux

Run:

```bash
bash start-linux.sh
```

Then enter the same room/secret shown in ForgeCodex and the workspace directory.

## Manual start

```bash
npm install
node index.mjs --room=123456 --secret=YOUR_PAIRING_SECRET --workspace="/path/to/project"
```

## Safety boundary

- Command working directories must remain inside the configured workspace.
- Several destructive OS-level commands are blocked by the Runner.
- Command runtime is limited to at most 10 minutes per call.
- stdout/stderr are capped before being returned to the Agent.
- Closing the Runner immediately removes shell/build/test access from remote clients.

The Runner is intended for a development workspace, not an unrestricted remote desktop or system administration shell.

## Git synchronization

GitHub Agent edits can happen through the GitHub API while the PC workspace is a separate local clone. ForgeCodex is instructed not to assume they are synchronized. Before build/test it may inspect `git status`, branches, and revisions. Keep the local clone authenticated if you want it to fetch/pull remote changes.
