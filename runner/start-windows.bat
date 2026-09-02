@echo off
setlocal
cd /d %~dp0
if not exist node_modules call npm install
set /p ROOM=Pairing room: 
set /p SECRET=Pairing secret: 
set /p WORKSPACE=Workspace folder (full path): 
node index.mjs --room=%ROOM% --secret=%SECRET% --workspace="%WORKSPACE%"
pause
