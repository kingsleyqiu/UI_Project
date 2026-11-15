import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {ApiError, INTENT_SCHEMA, SYSTEM_INSTRUCTION, validateInput, validateIntent} from './intent.js';

export const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 24_576) throw new ApiError(413, 'BODY_TOO_LARGE', 'The instruction is too large. Please shorten it.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'INVALID_JSON', 'Send a valid JSON object.'); }
}

export async function interpret(input, {apiKey, model = DEFAULT_MODEL, fetchImpl = fetch, timeoutMs = 20_000} = {}) {
  const data = validateInput(input);
  if (!apiKey?.trim()) throw new ApiError(503, 'MISSING_API_KEY', 'Set GEMINI_API_KEY in the local .env file, then restart the backend.');
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new ApiError(503, 'INVALID_MODEL', 'GEMINI_MODEL must be a Gemini model ID.');
  let response;
  try {
    response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: SYSTEM_INSTRUCTION}]},
        contents: [{role: 'user', parts: [{text: JSON.stringify(data)}]}],
        generationConfig: {responseMimeType: 'application/json', responseJsonSchema: INTENT_SCHEMA, maxOutputTokens: 1200},
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new ApiError(504, 'MODEL_TIMEOUT', 'Gemini timed out. No website action was authorized. Retry or continue manually.');
    throw new ApiError(502, 'MODEL_UNREACHABLE', 'Could not reach Gemini. Check the connection, then retry or continue manually.');
  }
  if (!response.ok) {
    if (response.status === 429) throw new ApiError(429, 'QUOTA_EXHAUSTED', 'Gemini quota or rate limit reached. Pause and retry later, or continue manually. No paid fallback is used.');
    if ([400, 401, 403, 404].includes(response.status)) throw new ApiError(503, 'MODEL_CONFIGURATION', 'Gemini rejected the key or model. Check the local key, free-tier model availability and project settings.');
    throw new ApiError(502, 'MODEL_UNAVAILABLE', 'Gemini is unavailable. Retry later or continue manually.');
  }
  try {
    const result = await response.json();
    const candidate = result.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Incomplete output');
    const output = candidate?.content?.parts?.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text).join('');
    return validateIntent(JSON.parse(output), data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'INVALID_MODEL_OUTPUT', 'Gemini did not return a complete menu-matched instruction. Please rephrase.');
  }
}

export function createServer(options = {}) {
  const settings = {enabled: process.env.PIZZA_ENABLE_GEMINI === 'true', apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || DEFAULT_MODEL, ...options};
  return http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const allowed = !origin || /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    const send = (status, body) => {
      response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      response.end(JSON.stringify(body));
    };
    if (!allowed) return send(403, {error: {code: 'ORIGIN_REJECTED', message: 'Use the Chrome extension to access this local backend.'}});
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pizza-Assistant');
      response.writeHead(204); response.end(); return;
    }
    if (request.method === 'GET' && request.url === '/health') return send(200, {ok: true, enabled: settings.enabled === true, configured: settings.enabled === true && Boolean(settings.apiKey?.trim()), model: settings.model});
    if (request.method !== 'POST' || request.url !== '/interpret') return send(404, {error: {code: 'NOT_FOUND', message: 'Unknown endpoint.'}});
    if (request.headers['x-pizza-assistant'] !== '1' || !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) return send(415, {error: {code: 'JSON_REQUIRED', message: 'Use JSON with the X-Pizza-Assistant header.'}});
    if (settings.enabled !== true) return send(503, {error: {code: 'API_DISABLED', message: 'Gemini connection is reserved for later setup. No model request was sent. Continue using the website manually.'}});
    try { send(200, {intent: await interpret(await readBody(request), settings)}); }
    catch (error) {
      const known = error instanceof ApiError;
      send(known ? error.status : 500, {error: {code: known ? error.code : 'SERVER_ERROR', message: known ? error.message : 'The local backend could not process this request.'}});
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(8787, '127.0.0.1', () => {
    console.log('Pizza assistant backend: http://127.0.0.1:8787');
    console.log(process.env.PIZZA_ENABLE_GEMINI !== 'true'
      ? 'Placeholder mode: Gemini connection is reserved for later setup. No model requests are sent.'
      : process.env.GEMINI_API_KEY ? 'Gemini explicitly enabled. Only use a free-tier project; this backend never upgrades billing.' : 'Gemini is enabled but no local key is configured.');
  });
}
