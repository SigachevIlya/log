import type { Plugin } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
export function localPwa(buildId: string, version: string): Plugin {
  let output = '';
  return { name: 'log-offline-shell', apply: 'build', configResolved(config) { output = resolve(config.root, config.build.outDir); }, async closeBundle() {
    const files: Array<{ url: string; sha256: string }> = [];
    async function visit(directory: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) { const path = resolve(directory, entry.name); if (entry.isDirectory()) await visit(path); else if (entry.name !== 'sw.js' && !entry.name.endsWith('.map') && !entry.name.startsWith('.')) files.push({ url: relative(output, path).replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(path)).digest('hex') }); }
    }
    await visit(output); files.sort((a, b) => a.url.localeCompare(b.url));
    const template = await readFile(resolve('src/pwa/service-worker.js'), 'utf8');
    await writeFile(resolve(output, 'sw.js'), template.replace('/*BUILD_ID*/', JSON.stringify(buildId)).replace('/*APP_VERSION*/', JSON.stringify(version)).replace('/*PRECACHE*/', JSON.stringify(files)), 'utf8');
    await writeFile(resolve(output, '.nojekyll'), '', 'utf8');
  } };
}
