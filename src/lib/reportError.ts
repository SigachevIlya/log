/** Keep the original exception (including stack/cause) available in DevTools. */
export function reportError(operation: string, error: unknown): void {
  console.error(`[LOG.] ${operation}`, error, {
    origin: globalThis.location?.origin,
    secureContext: globalThis.isSecureContext,
    indexedDB: typeof globalThis.indexedDB,
    randomUUID: typeof globalThis.crypto?.randomUUID,
    getRandomValues: typeof globalThis.crypto?.getRandomValues,
  });
}
