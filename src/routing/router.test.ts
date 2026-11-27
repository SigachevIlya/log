import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('rejects an active-route effect captured before completion changed the route', async () => {
  const replaceState = vi.fn(), pushState = vi.fn();
  vi.stubGlobal('location', { hash: '#/workout/active' });
  vi.stubGlobal('history', { state: {}, replaceState, pushState });
  vi.stubGlobal('window', { addEventListener() {} });
  const { go, currentRoute } = await import('./router');
  const capturedRoute = currentRoute();
  go('/workout/summary/saved', { guard: false });
  // A passive effect still holds the old route and data.active === undefined.
  expect(go('/workout', { replace: true, guard: false, from: capturedRoute })).toBe(false);
  expect(currentRoute()).toBe('/workout/summary/saved');
  expect(replaceState).toHaveBeenCalledTimes(1);
  // Missing objects on the current route must still redirect.
  expect(go('/workout', { replace: true, guard: false, from: currentRoute() })).toBe(true);
});
