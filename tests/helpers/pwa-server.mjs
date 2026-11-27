import http from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
async function load(directory) {
  const map = new Map();
  async function visit(path) { for (const entry of await readdir(path, { withFileTypes: true })) { const name = resolve(path, entry.name); if (entry.isDirectory()) await visit(name); else map.set(relative(directory, name).replaceAll('\\', '/'), await readFile(name)); } }
  await visit(directory); return map;
}
function nextVersion(source) {
  const map = new Map(source), script = map.get('sw.js').toString('utf8'), previous = JSON.parse(script.match(/const BUILD = (.*);/)[1]), version = JSON.parse(script.match(/const VERSION = (.*);/)[1]), next = version.replace(/\d+$/, number => String(Number(number) + 1)), build = `${previous.replace(version, next)}-test-update`;
  const names = new Map([...map.keys()].filter(name => name.endsWith('.js') && name !== 'sw.js').map(name => [name, name.replace(/\.js$/, '-test-v2.js')]));
  for (const [name, content] of source) if (name.endsWith('.js') && name !== 'sw.js' || name === 'index.html') { let text = content.toString('utf8').replaceAll(previous, build).replaceAll(version, next); for (const [before, after] of names) text = text.replaceAll(basename(before), basename(after)); map.delete(name); map.set(names.get(name) ?? name, Buffer.from(text)); }
  const files = JSON.parse(script.match(/const FILES = (.*);/)[1]).map(file => { const url = names.get(file.url) ?? file.url; return { url, sha256: createHash('sha256').update(map.get(url)).digest('hex') }; });
  map.set('sw.js', Buffer.from(script.replace(/const BUILD = .*;/, `const BUILD = ${JSON.stringify(build)};`).replace(/const VERSION = .*;/, `const VERSION = ${JSON.stringify(next)};`).replace(/const FILES = .*;/, `const FILES = ${JSON.stringify(files)};`)));
  return map;
}
const { version: appVersion } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const normal = await load(resolve('dist')), configured = await load(resolve('artifacts/' + appVersion + '/subpath-build'));
const versions = [normal, nextVersion(normal)], configuredVersions = [configured, nextVersion(configured)];
let version = 0, broken = false;
http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4175'); response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/__test__/reset') { version = 0; broken = false; response.end('reset'); return; }
  if (url.pathname === '/__test__/version/2') { version = 1; response.end('updated'); return; }
  if (url.pathname === '/__test__/broken') { broken = true; response.end('broken'); return; }
  if (url.pathname === '/__test__/ready') { response.end('ready'); return; }
  let path = decodeURIComponent(url.pathname), maps = versions;
  if (path.startsWith('/configured/')) { path = path.slice('/configured'.length); maps = configuredVersions; }
  else if (path.startsWith('/log/')) path = path.slice('/log'.length);
  const name = path === '/' ? 'index.html' : path.slice(1), content = maps[version].get(name);
  if (!content || name.includes('..')) { response.statusCode = 404; response.end('not found'); return; }
  response.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html;charset=utf-8' : name.endsWith('.webmanifest') ? 'application/manifest+json' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream');
  response.end(broken && name.endsWith('.css') ? '/* wrong version */' : content);
}).listen(4175, '127.0.0.1', () => console.log('PWA production fixtures ready on 4175'));
