import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
// Exact source of the published 0.5.2, with its original SW and loading path.
const revision = 'a108ab1293439856802017e894d61de4ebe6b576';
const root = resolve('.'), destination = resolve('artifacts/0.5.3/previous-source');
mkdirSync(destination, { recursive: true });
const archive = spawnSync('git', ['archive', '--format=tar', revision], { maxBuffer: 16 * 1024 * 1024 });
if (archive.status !== 0) throw new Error('Previous release source unavailable. Fetch the Git history before PWA tests.');
const unpack = spawnSync('tar', ['-xf', '-', '-C', destination], { input: archive.stdout });
if (unpack.status !== 0) throw new Error('Cannot unpack previous PWA fixture');
if (!existsSync(resolve(destination, 'node_modules'))) symlinkSync(resolve(root, 'node_modules'), resolve(destination, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const build = spawnSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--base=/log/'], { cwd: destination, stdio: 'inherit', env: { ...process.env, LOG_BASE_PATH: '/log/' } });
process.exit(build.status ?? 1);
