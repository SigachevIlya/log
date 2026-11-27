/* Built by build/pwa.ts. This file does not access workout IndexedDB. */
const BUILD = /*BUILD_ID*/;
const VERSION = /*APP_VERSION*/;
const FILES = /*PRECACHE*/;
const SCOPE = self.registration.scope;
const PREFIX = `log-shell:${new URL(SCOPE).pathname}::`;
const CACHE = `${PREFIX}${BUILD}`;
const urls = new Map(FILES.map(file => [new URL(file.url, SCOPE).href, file]));
const inScope = client => client.url.startsWith(SCOPE);
async function verified(response, file) {
  if (!response?.ok) return false;
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') === file.sha256;
}
async function checkedCache() {
  const cache = await caches.open(CACHE), damaged = [];
  for (const file of FILES) if (!(await verified(await cache.match(new URL(file.url, SCOPE).href), file))) damaged.push(file);
  return { cache, damaged };
}
let repairing;
function repairCache() {
  if (repairing) return repairing;
  repairing = (async () => {
    const { cache, damaged } = await checkedCache(), responses = [];
    // Fetch and verify every replacement before touching the existing usable cache.
    // The same build's manifest fences a newer deployment; no reload or DB access.
    for (const file of damaged) {
      const url = new URL(file.url, SCOPE).href, response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
      if (!(await verified(response, file))) throw new Error('Нужный ресурс недоступен или относится к другой сборке: ' + file.url);
      responses.push([url, response]);
    }
    for (const [url, response] of responses) await cache.put(url, response);
    return (await checkedCache()).damaged.length === 0;
  })().finally(() => { repairing = undefined; });
  return repairing;
}
const ask = (client, type) => new Promise(resolve => {
  const channel = new MessageChannel();
  const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 1600);
  channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
  client.postMessage({ type }, [channel.port2]);
});
async function clientsHere() { return (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(inScope); }
async function cleanup() {
  const clients = await clientsHere(), versions = await Promise.all(clients.map(client => ask(client, 'LOG_BUILD')));
  // Keep old hashed resources while ANY old/unknown tab may still need a lazy chunk.
  if (versions.some(value => !value || value.buildId !== BUILD)) return;
  await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      for (const file of FILES) {
        const url = new URL(file.url, SCOPE).href, response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
        if (!response.ok) throw new Error(`Missing offline file: ${file.url}`);
        if (!(await verified(response, file))) throw new Error(`Mixed application versions: ${file.url}`);
        await cache.put(url, response);
      }
    } catch (error) { await caches.delete(CACHE); throw error; }
    // Never skipWaiting on discovery/installation of an update.
  })());
});
self.addEventListener('activate', event => { event.waitUntil((async () => { await self.clients.claim(); await cleanup(); })()); });
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || !url.href.startsWith(SCOPE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const target = request.mode === 'navigate' ? new URL('index.html', SCOPE).href : new URL(url.pathname, SCOPE).href;
    const file = urls.get(target), current = await cache.match(target, { ignoreSearch: true });
    if (current && (!file || await verified(current, file))) return current;
    if (file) {
      const response = await fetch(new Request(target, { cache: 'reload', credentials: 'same-origin' }));
      if (!(await verified(response, file))) throw new Error('Ресурс другой сборки или повреждён: ' + file.url);
      await cache.put(target, response.clone()); return response;
    }
    for (const key of (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE)) { const older = await (await caches.open(key)).match(request, { ignoreSearch: true }); if (older) return older; }
    return fetch(request);
  })());
});
self.addEventListener('message', event => {
  const port = event.ports[0], type = event.data?.type;
  if (type === 'LOG_STATUS') event.waitUntil((async () => { try { const { damaged } = await checkedCache(); port?.postMessage({ buildId: BUILD, version: VERSION, ready: damaged.length === 0, damaged: damaged.length }); } catch (error) { console.error('[LOG.] Проверка автономного кэша', error); port?.postMessage({ buildId: BUILD, version: VERSION, ready: false }); } })());
  if (type === 'LOG_REPAIR') event.waitUntil((async () => { try { port?.postMessage({ ok: await repairCache() }); } catch (error) { console.error('[LOG.] Восстановление автономного кэша', error); port?.postMessage({ ok: false, reason: error.message }); } })());
  if (type === 'LOG_CLEANUP') event.waitUntil(cleanup());
  if (type === 'LOG_APPLY_UPDATE') event.waitUntil((async () => {
    const clients = await clientsHere(), states = await Promise.all(clients.map(client => ask(client, 'LOG_PREPARE_UPDATE')));
    const blocked = states.find(value => !value?.safe);
    if (states.some(value => !value?.safe)) { clients.forEach(client => client.postMessage({ type: 'LOG_RELEASE_UPDATE' })); port?.postMessage({ ok: false, reason: blocked?.reason || 'Другая вкладка не готова к обновлению. Закройте её или завершите ввод.' }); return; }
    port?.postMessage({ ok: true }); await self.skipWaiting();
  })());
});
