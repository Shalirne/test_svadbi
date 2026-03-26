const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const REQUIRED_HEADERS = [
  'submitted_at',
  'full_name',
  'family_details',
  'attendance',
  'drinks',
  'allergy',
  'allergy_details',
  'music_track',
  'source',
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function getEnv(name) {
  return (process.env[name] || '').trim();
}

function normalizePrivateKey(rawKey) {
  return rawKey.replace(/\\n/g, '\n').trim();
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsignedToken}.${signature}`;
}

async function getAccessToken() {
  const clientEmail = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!clientEmail || !privateKeyRaw) {
    throw new Error('Missing Google service account credentials.');
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }, normalizePrivateKey(privateKeyRaw));

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(`Failed to obtain Google access token: ${data?.error || response.status}`);
  }
  return data.access_token;
}

async function googleApiRequest(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Google API request failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDrinks(value) {
  if (Array.isArray(value)) {
    return value.map((item) => asTrimmedString(item)).filter(Boolean).join(', ');
  }
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePayload(payload = {}) {
  const allergy = asTrimmedString(payload.allergy);
  return {
    submitted_at: formatTimestamp(),
    full_name: asTrimmedString(payload.full_name),
    family_details: asTrimmedString(payload.family_details),
    attendance: asTrimmedString(payload.attendance),
    drinks: normalizeDrinks(payload.drinks),
    allergy,
    allergy_details: allergy === 'Да' ? asTrimmedString(payload.allergy_details) : '',
    music_track: asTrimmedString(payload.music_track),
    source: 'site',
  };
}

function validatePayload(row) {
  const details = [];
  if (!row.full_name) details.push({ field: 'full_name', message: 'Поле full_name обязательно.' });
  if (!row.attendance) details.push({ field: 'attendance', message: 'Поле attendance обязательно.' });
  if (row.allergy === 'Да' && !row.allergy_details) {
    details.push({ field: 'allergy_details', message: 'Поле allergy_details обязательно, если allergy = "Да".' });
  }
  return details;
}

async function verifySheetHeader(spreadsheetId, sheetName) {
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const meta = await googleApiRequest(metaUrl);
  const sheetExists = Array.isArray(meta.sheets) && meta.sheets.some((sheet) => sheet.properties?.title === sheetName);
  if (!sheetExists) {
    throw new Error(`Sheet with name "${sheetName}" was not found.`);
  }
  const range = encodeURIComponent(`${sheetName}!A1:I1`);
  const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const data = await googleApiRequest(headerUrl);
  const actual = (data.values?.[0] || []).map((value) => String(value).trim());
  const matches = actual.length === REQUIRED_HEADERS.length && REQUIRED_HEADERS.every((header, index) => header === actual[index]);
  if (!matches) {
    throw new Error(`Sheet header mismatch. Expected ${REQUIRED_HEADERS.join(', ')} but received ${actual.join(', ')}`);
  }
}

async function appendRsvpRow(spreadsheetId, sheetName, row) {
  const range = encodeURIComponent(`${sheetName}!A:I`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const rowValues = [
    row.submitted_at,
    row.full_name,
    row.family_details,
    row.attendance,
    row.drinks,
    row.allergy,
    row.allergy_details,
    row.music_track,
    row.source,
  ];
  await googleApiRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [rowValues] }),
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function safeResolvePath(urlPathname) {
  const decodedPath = decodeURIComponent(urlPathname.split('?')[0]);
  const normalizedPath = path.normalize(decodedPath).replace(/^([.][.][/\\])+/, '');
  const requestedPath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  const filePath = path.join(ROOT_DIR, requestedPath);
  return filePath.startsWith(ROOT_DIR) ? filePath : null;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 100 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function serveStaticFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const filePath = safeResolvePath(url.pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function handleRsvp(req, res) {
  try {
    const payload = await readJsonBody(req);
    const row = normalizePayload(payload);
    const validationErrors = validatePayload(row);
    if (validationErrors.length) {
      sendJson(res, 400, { success: false, error: 'validation_error', details: validationErrors });
      return;
    }
    const spreadsheetId = getEnv('GOOGLE_SHEET_ID');
    const sheetName = getEnv('GOOGLE_SHEET_NAME');
    if (!spreadsheetId || !sheetName) {
      throw new Error('Missing Google Sheets configuration.');
    }
    await verifySheetHeader(spreadsheetId, sheetName);
    await appendRsvpRow(spreadsheetId, sheetName, row);
    sendJson(res, 201, { success: true });
  } catch (error) {
    console.error('[RSVP_SAVE_FAILED]', error && error.message ? error.message : error);
    const message = error && error.message === 'Invalid JSON payload'
      ? { success: false, error: 'validation_error', details: [{ field: 'payload', message: 'Некорректный JSON payload.' }] }
      : { success: false, error: 'save_failed', message: 'Не удалось сохранить ответ. Попробуйте ещё раз.' };
    const status = error && error.message === 'Invalid JSON payload' ? 400 : 500;
    sendJson(res, status, message);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/rsvp') {
    handleRsvp(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD, POST' });
    res.end('Method Not Allowed');
    return;
  }
  serveStaticFile(req, res);
});

server.listen(PORT, () => {
  console.log(`Wedding RSVP server is running at http://localhost:${PORT}`);
});
