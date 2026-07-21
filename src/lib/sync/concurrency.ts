/** Runs `fn` over `items` with at most `limit` in flight at once. Firing too many fully
 * concurrent Gmail/Graph API calls at once reliably triggers provider rate-limiting well before
 * they all complete -- this is what caused most of a page to fail in practice, not an isolated/
 * rare error. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
