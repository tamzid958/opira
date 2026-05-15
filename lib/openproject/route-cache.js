// Tiny TTL + LRU-ish cache used by the heavy compute routes (burndown,
// capacity, carryover). The plain `new Map()` pattern these routes had
// before never evicts — on a long-running server with many projects/
// sprints, the map grows unbounded.
//
// Eviction strategy:
//   - hard ttlMs: entries past TTL are returned as misses and pruned on get.
//   - hard maxEntries: when set() would exceed the cap, the oldest insertion
//     is evicted first (Map iteration is insertion-order in JS).

export function makeCache({ ttlMs, maxEntries = 200 } = {}) {
  const store = new Map();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() - entry.t >= ttlMs) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      // Refresh insertion order so a recently-written key is "newest".
      if (store.has(key)) store.delete(key);
      store.set(key, { t: Date.now(), value });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
    },
    delete(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}
