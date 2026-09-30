#!/usr/bin/env node
// Frees a TCP port before `ng serve` (a leftover dev server otherwise blocks `npm start`). Best effort, never fails the start.
const { execSync } = require('node:child_process');
const port = Number(process.argv[2] || 5051);

try {
  if (process.platform === 'win32') {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const pids = [...new Set(out.split('\n').filter(l => /LISTENING/i.test(l)).map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
    pids.forEach(pid => execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }));
    if (pids.length) console.log(`freed port ${port} (pid ${pids.join(', ')})`);
  } else {
    const pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
    pids.forEach(pid => process.kill(Number(pid), 'SIGTERM'));
    if (pids.length) console.log(`freed port ${port} (pid ${pids.join(', ')})`);
  }
} catch {
  // nothing listening, or no permission: let ng serve report it
}
