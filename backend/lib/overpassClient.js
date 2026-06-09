const MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const MIRROR_TIMEOUT_MS = 28000;
const inFlight = new Map();
let queue = Promise.resolve();

function enqueue(task) {
  const run = async () => task();
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}

async function fetchMirror(endpoint, query) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(MIRROR_TIMEOUT_MS),
  });

  if (res.status === 429 || res.status === 504 || res.status === 502 || res.status === 503) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function queryMirrors(query) {
  let lastErr;
  for (const endpoint of MIRRORS) {
    try {
      return await fetchMirror(endpoint, query);
    } catch (err) {
      lastErr = err;
      console.warn(`Mirror ${endpoint} failed: ${err.message}`);
    }
  }
  throw lastErr || new Error('All Overpass mirrors failed');
}

async function queryOverpassInternal(query, fallbackQuery) {
  try {
    return await queryMirrors(query);
  } catch (err) {
    if (!fallbackQuery) throw err;
    console.warn('Full Overpass query failed, trying lighter fallback…');
    try {
      return await queryMirrors(fallbackQuery);
    } catch (fallbackErr) {
      throw fallbackErr;
    }
  }
}

function queryOverpass(query, fallbackQuery, dedupeKey) {
  if (dedupeKey && inFlight.has(dedupeKey)) {
    return inFlight.get(dedupeKey);
  }

  const promise = enqueue(() => queryOverpassInternal(query, fallbackQuery));

  // Prevent unhandled rejection when multiple callers share the same in-flight request
  promise.catch(() => {});

  if (dedupeKey) {
    inFlight.set(dedupeKey, promise);
    promise.finally(() => {
      if (inFlight.get(dedupeKey) === promise) inFlight.delete(dedupeKey);
    });
  }

  return promise;
}

module.exports = { queryOverpass };
