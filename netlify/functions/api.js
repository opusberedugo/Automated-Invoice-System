/**
 * Netlify Function — api.js (ESM, zero external deps except nodemailer)
 * Uses Node.js built-in `fetch` + `crypto` to talk to Google Sheets REST API directly.
 * This avoids the `googleapis` package which causes silent bundler failures on Netlify.
 */
import { createSign } from 'node:crypto';
import nodemailer from 'nodemailer';

// ─── Response helpers ─────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-sheet-id, x-google-email, x-google-key',
  'Content-Type': 'application/json'
};
const ok  = (body)     => ({ statusCode: 200, headers: CORS, body: JSON.stringify(body) });
const err = (code, msg)=> ({ statusCode: code,headers: CORS, body: JSON.stringify({ error: msg }) });

// ─── Google JWT + OAuth ───────────────────────────────────────────────────────
function b64url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeJWT(clientEmail, privateKey) {
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now
  }));
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(privateKey, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

async function getAccessToken(clientEmail, privateKey) {
  const jwt  = makeJWT(clientEmail, privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion:  jwt
  });
  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google auth failed: ${data.error_description || data.error || JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Sheets REST wrappers ─────────────────────────────────────────────────────
async function sheetsGet(token, sheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.values || [];
}

async function sheetsAppend(token, sheetId, range, rows) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values: rows })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
}

async function sheetsPut(token, sheetId, range, rows) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res  = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values: rows })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const hdrs = rows[0];
  return rows.slice(1).map(row => Object.fromEntries(hdrs.map((h, i) => [h, row[i] ?? ''])));
}

async function appendRow(token, sheetId, tab, headers, data) {
  await sheetsAppend(token, sheetId, `${tab}!A:A`, [headers.map(h => data[h] ?? '')]);
}

async function updateRow(token, sheetId, tab, keyCol, keyVal, updates) {
  const rows = await sheetsGet(token, sheetId, `${tab}!A:Z`);
  if (!rows.length) throw new Error(`Tab ${tab} is empty.`);
  const hdrs = rows[0];
  const ki   = hdrs.indexOf(keyCol);
  if (ki === -1) throw new Error(`Column "${keyCol}" not found in ${tab}.`);
  const mi   = rows.findIndex((r, i) => i > 0 && r[ki] === keyVal);
  if (mi === -1) throw new Error(`${keyCol}=${keyVal} not found in ${tab}.`);
  const curr    = rows[mi];
  const updated = hdrs.map((h, i) => updates[h] !== undefined ? updates[h] : (curr[i] ?? ''));
  const endCol  = String.fromCharCode(64 + hdrs.length);
  await sheetsPut(token, sheetId, `${tab}!A${mi + 1}:${endCol}${mi + 1}`, [updated]);
}

// ─── Credential extraction ────────────────────────────────────────────────────
function getCreds(event) {
  let email  = event.headers['x-google-email'];
  let key    = event.headers['x-google-key'];
  let sheet  = event.headers['x-sheet-id'];

  // Decode base64-encoded private key (client encodes it to handle newlines in headers)
  if (key && !key.includes('-----BEGIN')) {
    try { key = Buffer.from(key, 'base64').toString('utf-8'); } catch (_) {}
  }
  if (!email || !key || !sheet) throw new Error('MISSING_CONFIG');

  // Normalize PEM newlines
  key = key.replace(/\r/g, '').replace(/\\n/g, '\n').trim();
  return { email, key, sheet };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const method = event.httpMethod;

  // Normalise path — Netlify may pass the original URL or the function URL
  let path = (event.path || '').replace(/\/$/, '');
  if (path.includes('/.netlify/functions/api')) {
    path = path.replace('/.netlify/functions/api', '/api');
  } else if (!path.startsWith('/api')) {
    path = '/api' + path;
  }

  // ── Health check (no auth) ─────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/ping') {
    return ok({ ok: true, message: 'Netlify function is running ✓', rawPath: event.path, normalizedPath: path });
  }

  try {

    // ── GET /api/check-connection ────────────────────────────────────────────
    if (method === 'GET' && path === '/api/check-connection') {
      try {
        const { email, key, sheet } = getCreds(event);
        const token  = await getAccessToken(email, key);
        const raw    = await sheetsGet(token, sheet, 'Settings!A:C');
        const list   = rowsToObjects(raw);
        const cfg    = Object.fromEntries(list.map(s => [s.Key, s.Value]));
        return ok({ connected: true, sheetId: sheet, companyName: cfg['company_name'] || 'Invoice System', settings: cfg });
      } catch (e) {
        if (e.message === 'MISSING_CONFIG') return err(400, 'Missing credentials in request headers.');
        return err(500, e.message);
      }
    }

    // ── All other endpoints need credentials ─────────────────────────────────
    const { email, key, sheet } = getCreds(event);
    const token = await getAccessToken(email, key);

    // ── GET /api/settings ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/settings') {
      const raw  = await sheetsGet(token, sheet, 'Settings!A:C');
      const list = rowsToObjects(raw);
      return ok(Object.fromEntries(list.map(s => [s.Key, s.Value])));
    }

    // ── POST /api/settings ───────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/settings') {
      const body    = JSON.parse(event.body || '{}');
      const raw     = await sheetsGet(token, sheet, 'Settings!A:C');
      const headers = raw[0] || ['Key', 'Value', 'Category'];
      for (const [k, v] of Object.entries(body)) {
        try { await updateRow(token, sheet, 'Settings', 'Key', k, { Value: String(v) }); }
        catch (_) { await appendRow(token, sheet, 'Settings', headers, { Key: k, Value: String(v), Category: 'General' }); }
      }
      return ok({ success: true });
    }

    // ── GET /api/customers ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/customers') {
      return ok(rowsToObjects(await sheetsGet(token, sheet, 'Customers!A:F')));
    }

    // ── POST /api/customers ──────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/customers') {
      const c       = JSON.parse(event.body || '{}');
      const raw     = await sheetsGet(token, sheet, 'Customers!A:F');
      const headers = raw[0] || ['CustomerID', 'Name', 'Email', 'Phone', 'Address', 'Website'];
      if (!c.CustomerID) c.CustomerID = 'CUST-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      if (rowsToObjects(raw).some(x => x.CustomerID === c.CustomerID)) await updateRow(token, sheet, 'Customers', 'CustomerID', c.CustomerID, c);
      else await appendRow(token, sheet, 'Customers', headers, c);
      return ok({ success: true, customer: c });
    }

    // ── GET /api/services ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/services') {
      return ok(rowsToObjects(await sheetsGet(token, sheet, 'Services!A:D')));
    }

    // ── POST /api/services ───────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/services') {
      const s       = JSON.parse(event.body || '{}');
      const raw     = await sheetsGet(token, sheet, 'Services!A:D');
      const headers = raw[0] || ['ServiceID', 'Description', 'Unit', 'DefaultCost'];
      if (!s.ServiceID) s.ServiceID = 'SRV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      if (rowsToObjects(raw).some(x => x.ServiceID === s.ServiceID)) await updateRow(token, sheet, 'Services', 'ServiceID', s.ServiceID, s);
      else await appendRow(token, sheet, 'Services', headers, s);
      return ok({ success: true, service: s });
    }

    // ── GET /api/invoices ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/invoices') {
      const [invRows, itmRows, custRows] = await Promise.all([
        sheetsGet(token, sheet, 'Invoices!A:M'),
        sheetsGet(token, sheet, 'InvoiceItems!A:G'),
        sheetsGet(token, sheet, 'Customers!A:F')
      ]);
      const invoices  = rowsToObjects(invRows);
      const items     = rowsToObjects(itmRows);
      const custMap   = Object.fromEntries(rowsToObjects(custRows).map(c => [c.CustomerID, c]));
      return ok(invoices.map(inv => ({
        ...inv,
        Customer: custMap[inv.CustomerID] || { Name: inv.CustomerID },
        Items:    items.filter(it => it.InvoiceID === inv.InvoiceID)
      })).reverse());
    }

    // ── POST /api/invoices ───────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/invoices') {
      const { invoiceData, items } = JSON.parse(event.body || '{}');
      const rawInv  = await sheetsGet(token, sheet, 'Invoices!A:M');
      if (!invoiceData.InvoiceID) {
        invoiceData.InvoiceID = `INV-${new Date().getFullYear()}-${String(rowsToObjects(rawInv).length + 1).padStart(4, '0')}`;
      }
      const invHdrs = rawInv[0] || ['InvoiceID','IssueDate','DueDate','PaymentTerms','CustomerID','Subtotal','Discount','TaxRate','TaxAmount','Total','Status','Notes','PDFUrl'];
      invoiceData.Status = invoiceData.Status || 'Sent';
      await appendRow(token, sheet, 'Invoices', invHdrs, invoiceData);
      const rawItm  = await sheetsGet(token, sheet, 'InvoiceItems!A:G');
      const itmHdrs = rawItm[0] || ['ItemID','InvoiceID','Description','QTY','Unit','Cost','Amount'];
      for (const item of items) {
        await appendRow(token, sheet, 'InvoiceItems', itmHdrs, {
          ItemID:      'ITEM-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
          InvoiceID:   invoiceData.InvoiceID,
          Description: item.Description,
          QTY:         item.QTY,
          Unit:        item.Unit || 'page',
          Cost:        item.Cost,
          Amount:      Number(item.QTY) * Number(item.Cost)
        });
      }
      return ok({ success: true, InvoiceID: invoiceData.InvoiceID });
    }

    // ── PATCH /api/invoices/:id/status ───────────────────────────────────────
    const sm = path.match(/^\/api\/invoices\/([^/]+)\/status$/);
    if (method === 'PATCH' && sm) {
      const { status } = JSON.parse(event.body || '{}');
      await updateRow(token, sheet, 'Invoices', 'InvoiceID', sm[1], { Status: status });
      return ok({ success: true });
    }

    // ── POST /api/invoices/send-email ────────────────────────────────────────
    if (method === 'POST' && path === '/api/invoices/send-email') {
      const { invoice, pdfDataUri, emailConfig } = JSON.parse(event.body || '{}');
      const { host, port = 587, user, pass, from, companyName } = emailConfig || {};
      if (!user || !pass) return err(400, 'Mail credentials not configured.');
      const t = nodemailer.createTransport({ host, port: Number(port), secure: Number(port) === 465, auth: { user, pass } });
      await t.sendMail({
        from:        from || `Billing <${user}>`,
        to:          invoice.Customer.Email,
        subject:     `Invoice ${invoice.InvoiceID} from ${companyName || 'Us'}`,
        text:        `Hello ${invoice.Customer.Name},\n\nAttached is invoice ${invoice.InvoiceID}.\nDue: ${invoice.DueDate}  Total: ${invoice.Total}\n\nThank you!`,
        attachments: [{ filename: `Invoice_${invoice.InvoiceID}.pdf`, content: Buffer.from(pdfDataUri.split(',')[1], 'base64') }]
      });
      return ok({ success: true });
    }

    return err(404, `No route: ${method} ${path}`);

  } catch (e) {
    console.error('[api]', e.message, e.stack);
    return err(500, e.message || 'Internal server error');
  }
};
