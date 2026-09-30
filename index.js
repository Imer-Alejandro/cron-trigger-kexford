const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 50000);

function readConfig() {
  const baseUrl = (process.env.RENDER_API_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.API_KEY || '').trim();
  const apiEmail = (process.env.API_EMAIL || '').trim();

  const missing = [];
  if (!baseUrl) missing.push('RENDER_API_URL');
  if (!apiKey) missing.push('API_KEY');
  if (!apiEmail) missing.push('API_EMAIL');

  return { baseUrl, apiKey, apiEmail, missing };
}

function parseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function triggerWorker() {
  const { baseUrl, apiKey, apiEmail, missing } = readConfig();

  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
  }

  const target = `${baseUrl}/worker/run`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'x-api-email': apiEmail,
      },
      body: JSON.stringify({ source: 'render-cron' }),
      signal: controller.signal,
    });

    const body = parseBody(await response.text());

    if (!response.ok) {
      throw new Error(`El servidor respondio ${response.status}: ${JSON.stringify(body)}`);
    }

    return { status: response.status, elapsedMs: Date.now() - startedAt, body };
  } finally {
    clearTimeout(timer);
  }
}

triggerWorker()
  .then(({ status, elapsedMs, body }) => {
    const detail = body && typeof body === 'object' ? body : {};
    console.log(`[cron] OK ${status} en ${elapsedMs}ms | processed=${detail.processed ?? 0}`);
    if (detail.throttled) console.log('[cron] Limite horario de campana alcanzado, se difiere al siguiente tick');
    if (detail.skipped) console.log(`[cron] Omitido: ${detail.reason}`);
    if (detail.deferred) console.log(`[cron] Diferidos por limite horario: ${detail.deferred}`);
    process.exit(0);
  })
  .catch((error) => {
    if (error.name === 'AbortError') {
      console.error(`[cron] ERROR timeout tras ${TIMEOUT_MS}ms contacting ${process.env.RENDER_API_URL}`);
    } else {
      console.error(`[cron] ERROR ${error.message}`);
      if (error.cause) {
        console.error(`[cron] causa: ${error.cause.code || error.cause.message || error.cause}`);
      }
    }
    process.exit(1);
  });
