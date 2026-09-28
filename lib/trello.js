const API_BASE = "https://api.trello.com/1";

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable ${name} manquante.`);
  return value;
}

function authParams() {
  return {
    key: env("TRELLO_KEY"),
    token: env("TRELLO_TOKEN"),
  };
}

const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  const all = { ...params, ...authParams() };

  for (const [key, value] of Object.entries(all)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  return url;
}

async function request(method, path, { params = {}, body = null } = {}) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = buildUrl(path, method === "GET" ? params : {});
    const headers = {};
    let requestBody;

    if (body && method !== "GET") {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify({ ...body, ...authParams() });
    }

    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
      cache: "no-store",
    });

    const raw = await response.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (response.ok) return data;

    if (!RETRY_STATUS.has(response.status) || attempt === maxAttempts) {
      const detail = typeof data === "string" ? data : JSON.stringify(data);
      throw new Error(`Trello ${response.status}: ${detail}`);
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 30000)
      : Math.min(1000 * 2 ** (attempt - 1), 12000);

    await sleep(wait);
  }

  throw new Error("Requête Trello impossible.");
}

export const trello = {
  get(path, params = {}) {
    return request("GET", path, { params });
  },
  post(path, body = {}) {
    return request("POST", path, { body });
  },
  put(path, body = {}) {
    return request("PUT", path, { body });
  },
};
