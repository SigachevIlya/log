import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--base=/configured/', '--outDir=artifacts/' + version + '/subpath-build'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
