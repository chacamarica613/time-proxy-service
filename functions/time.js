const SOURCES = [
  {
    name: 'TimeAPI.io',
    url: 'https://timeapi.io/api/v1/time/current/zone?timeZone=UTC',
    parse: async (res) => {
      const d = await res.json();
      return new Date(d.date_time).getTime();
    }
  },
  {
    name: 'WorldTimeAPI',
    url: 'https://worldtimeapi.org/api/timezone/Etc/UTC',
    parse: async (res) => {
      const d = await res.json();
      return d.unixtime * 1000;
    }
  }
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, cf: { cacheTtl: 0 } });
  } finally {
    clearTimeout(timer);
  }
}

async function getServerTime() {
  const edgeTime = Date.now();
  if (edgeTime && edgeTime > 0) {
    return {
      source: 'CloudflareEdge',
      serverTimeMs: edgeTime,
      workerRttMs: 0,
      workerReceivedAtMs: edgeTime
    };
  }

  for (const source of SOURCES) {
    try {
      const t0 = Date.now();
      const res = await fetchWithTimeout(source.url, 4000);
      if (!res.ok) continue;
      const serverMs = await source.parse(res);
      if (!serverMs) continue;
      const t1 = Date.now();
      return {
        source: source.name,
        serverTimeMs: serverMs,
        workerRttMs: t1 - t0,
        workerReceivedAtMs: t1
      };
    } catch (e) {
      continue;
    }
  }
  return null;
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const result = await getServerTime();

  if (!result) {
    return new Response(JSON.stringify({ error: 'Gagal mengambil waktu dari semua sumber' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS
    }
  });
}
