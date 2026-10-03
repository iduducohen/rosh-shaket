// VS Code (and other Electron hosts) set ELECTRON_RUN_AS_NODE, which makes the Cypress binary
// reject its own flags ("bad option: --smoke-test"). Drop it before starting Cypress.
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn('npx', ['cypress', ...process.argv.slice(2)], { stdio: 'inherit', env, shell: true });
child.on('exit', code => process.exit(code ?? 1));
