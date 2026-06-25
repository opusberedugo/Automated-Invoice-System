import { google } from 'googleapis';
import nodemailer from 'nodemailer';

// ─── CORS & response helpers ──────────────────────────────────────────────────
const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-sheet-id, x-google-email, x-google-key',
  'Content-Type': 'application/json'
};

const ok  = (body)         => ({ statusCode: 200, headers: HEADERS, body: JSON.stringify(body) });
const err = (code, msg)    => ({ statusCode: code, headers: HEADERS, body: JSON.stringify({ error: msg }) });

// ─── Google Sheets helpers ────────────────────────────────────────────────────
async function getSheetsClient(event) {
  let email      = event.headers['x-google-email'];
  let privateKey = event.headers['x-google-key'];
  let sheetId    = event.headers['x-sheet-id'];

  // Base64-decode the private key (client encodes it to safely send newlines via headers)
  if (privateKey && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    try { privateKey = Buffer.from(privateKey, 'base64').toString('utf-8'); } catch (_) {}
  }

  if (!email || !privateKey || !sheetId) throw new Error('MISSING_CONFIG');

  const formattedKey = privateKey.replace(/\r/g, '').replace(/\\n/g, '\n').trim();

  const auth = new google.auth.JWT({
    email,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return { sheets: google.sheets({ version: 'v4', auth }), sheetId };
}

function rowsToObjects(rows) {
  if (!rows || rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

async function getSheetValues(sheets, sheetId, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  return res.data.values || [];
}

async function appendRow(sheets, sheetId, tab, headers, data) {
  const row = headers.map(h => data[h] !== undefined ? data[h] : '');
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });
}

async function updateRow(sheets, sheetId, tab, keyCol, keyVal, headers, updates) {
  const rows = await getSheetValues(sheets, sheetId, `${tab}!A:Z`);
  if (!rows.length) throw new Error(`Tab ${tab} is empty.`);
  const hdrs = rows[0];
  const ki   = hdrs.indexOf(keyCol);
  if (ki === -1) throw new Error(`Column ${keyCol} not found in ${tab}.`);
  const mi = rows.findIndex((r, i) => i > 0 && r[ki] === keyVal);
  if (mi === -1) throw new Error(`${keyCol}=${keyVal} not found in ${tab}.`);
  const current = rows[mi];
  const updated = hdrs.map((h, i) => updates[h] !== undefined ? updates[h] : (current[i] ?? ''));
  const endCol  = String.fromCharCode(65 + hdrs.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!A${mi + 1}:${endCol}${mi + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [updated] }
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export const handler = async (event) => {
  // Preflight
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const method = event.httpMethod;

  // Normalise the path — Netlify can hand us the original URL or the function URL
  let path = event.path || '';
  if (path.includes('/.netlify/functions/api')) {
    path = path.replace('/.netlify/functions/api', '/api');
  } else if (!path.startsWith('/api')) {
    path = '/api' + path;
  }

  // Strip trailing slash for consistent matching
  path = path.replace(/\/$/, '') || '/api';

  try {

    // ── GET /api/ping ──────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/ping') {
      return ok({ ok: true, message: 'Netlify function is running ✓', path: event.path });
    }

    // ── GET /api/check-connection ──────────────────────────────────────────────
    if (method === 'GET' && path === '/api/check-connection') {
      try {
        const { sheets, sheetId } = await getSheetsClient(event);
        const raw      = await getSheetValues(sheets, sheetId, 'Settings!A:C');
        const list     = rowsToObjects(raw);
        const cfg      = Object.fromEntries(list.map(s => [s.Key, s.Value]));
        return ok({ connected: true, sheetId, companyName: cfg['company_name'] || 'Invoice System', settings: cfg });
      } catch (e) {
        if (e.message === 'MISSING_CONFIG') return err(400, 'Configuration credentials missing.');
        return err(500, e.message || 'Failed to authenticate with Google Sheets.');
      }
    }

    // ── GET /api/settings ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/settings') {
      const { sheets, sheetId } = await getSheetsClient(event);
      const raw  = await getSheetValues(sheets, sheetId, 'Settings!A:C');
      const list = rowsToObjects(raw);
      return ok(Object.fromEntries(list.map(s => [s.Key, s.Value])));
    }

    // ── POST /api/settings ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/settings') {
      const { sheets, sheetId } = await getSheetsClient(event);
      const body    = JSON.parse(event.body || '{}');
      const raw     = await getSheetValues(sheets, sheetId, 'Settings!A:C');
      const headers = raw[0] || ['Key', 'Value', 'Category'];
      for (const [key, value] of Object.entries(body)) {
        try {
          await updateRow(sheets, sheetId, 'Settings', 'Key', key, headers, { Value: String(value) });
        } catch (_) {
          await appendRow(sheets, sheetId, 'Settings', headers, { Key: key, Value: String(value), Category: 'General' });
        }
      }
      return ok({ success: true });
    }

    // ── GET /api/customers ─────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/customers') {
      const { sheets, sheetId } = await getSheetsClient(event);
      const raw = await getSheetValues(sheets, sheetId, 'Customers!A:F');
      return ok(rowsToObjects(raw));
    }

    // ── POST /api/customers ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/customers') {
      const { sheets, sheetId } = await getSheetsClient(event);
      const customer = JSON.parse(event.body || '{}');
      const raw      = await getSheetValues(sheets, sheetId, 'Customers!A:F');
      const headers  = raw[0] || ['CustomerID', 'Name', 'Email', 'Phone', 'Address', 'Website'];
      if (!customer.CustomerID) customer.CustomerID = 'CUST-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      const exists = rowsToObjects(raw).some(c => c.CustomerID === customer.CustomerID);
      if (exists) await updateRow(sheets, sheetId, 'Customers', 'CustomerID', customer.CustomerID, headers, customer);
      else         await appendRow(sheets, sheetId, 'Customers', headers, customer);
      return ok({ success: true, customer });
    }

    // ── GET /api/services ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/services') {
      const { sheets, sheetId } = await getSheetsClient(event);
      const raw = await getSheetValues(sheets, sheetId, 'Services!A:D');
      return ok(rowsToObjects(raw));
    }

    // ── POST /api/services ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/services') {
      const { sheets, sheetId } = await getSheetsClient(event);
      const service = JSON.parse(event.body || '{}');
      const raw     = await getSheetValues(sheets, sheetId, 'Services!A:D');
      const headers = raw[0] || ['ServiceID', 'Description', 'Unit', 'DefaultCost'];
      if (!service.ServiceID) service.ServiceID = 'SRV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      const exists = rowsToObjects(raw).some(s => s.ServiceID === service.ServiceID);
      if (exists) await updateRow(sheets, sheetId, 'Services', 'ServiceID', service.ServiceID, headers, service);
      else         await appendRow(sheets, sheetId, 'Services', headers, service);
      return ok({ success: true, service });
    }

    // ── GET /api/invoices ──────────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/invoices') {
      const { sheets, sheetId } = await getSheetsClient(event);
      const invoices   = rowsToObjects(await getSheetValues(sheets, sheetId, 'Invoices!A:M'));
      const items      = rowsToObjects(await getSheetValues(sheets, sheetId, 'InvoiceItems!A:G'));
      const customers  = rowsToObjects(await getSheetValues(sheets, sheetId, 'Customers!A:F'));
      const custMap    = Object.fromEntries(customers.map(c => [c.CustomerID, c]));
      const enriched   = invoices.map(inv => ({
        ...inv,
        Customer: custMap[inv.CustomerID] || { Name: inv.CustomerID },
        Items:    items.filter(it => it.InvoiceID === inv.InvoiceID)
      }));
      return ok(enriched.reverse());
    }

    // ── POST /api/invoices ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/invoices') {
      const { sheets, sheetId }       = await getSheetsClient(event);
      const { invoiceData, items }    = JSON.parse(event.body || '{}');
      const rawInv = await getSheetValues(sheets, sheetId, 'Invoices!A:M');
      if (!invoiceData.InvoiceID) {
        const count = rowsToObjects(rawInv).length + 1;
        invoiceData.InvoiceID = `INV-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
      }
      const invHeaders = rawInv[0] || ['InvoiceID','IssueDate','DueDate','PaymentTerms','CustomerID','Subtotal','Discount','TaxRate','TaxAmount','Total','Status','Notes','PDFUrl'];
      invoiceData.Status = invoiceData.Status || 'Sent';
      await appendRow(sheets, sheetId, 'Invoices', invHeaders, invoiceData);
      const rawItems  = await getSheetValues(sheets, sheetId, 'InvoiceItems!A:G');
      const itmHdrs   = rawItems[0] || ['ItemID','InvoiceID','Description','QTY','Unit','Cost','Amount'];
      for (const item of items) {
        await appendRow(sheets, sheetId, 'InvoiceItems', itmHdrs, {
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

    // ── PATCH /api/invoices/:id/status ─────────────────────────────────────────
    const statusMatch = path.match(/^\/api\/invoices\/([^/]+)\/status$/);
    if (method === 'PATCH' && statusMatch) {
      const { sheets, sheetId } = await getSheetsClient(event);
      const { status }          = JSON.parse(event.body || '{}');
      const raw                 = await getSheetValues(sheets, sheetId, 'Invoices!A:M');
      await updateRow(sheets, sheetId, 'Invoices', 'InvoiceID', statusMatch[1], raw[0], { Status: status });
      return ok({ success: true });
    }

    // ── POST /api/invoices/send-email ──────────────────────────────────────────
    if (method === 'POST' && path === '/api/invoices/send-email') {
      const { invoice, pdfDataUri, emailConfig } = JSON.parse(event.body || '{}');
      const { host, port = 587, user, pass, from, companyName } = emailConfig || {};
      if (!user || !pass) return err(400, 'Mail server credentials are not configured.');
      const transporter = nodemailer.createTransport({ host, port: Number(port), secure: Number(port) === 465, auth: { user, pass } });
      const pdfBuffer   = Buffer.from(pdfDataUri.split(',')[1], 'base64');
      await transporter.sendMail({
        from:        from || `Billing <${user}>`,
        to:          invoice.Customer.Email,
        subject:     `Invoice ${invoice.InvoiceID} from ${companyName || 'Us'}`,
        text:        `Hello ${invoice.Customer.Name},\n\nPlease find attached invoice ${invoice.InvoiceID} for ${invoice.Total}.\n\nDue: ${invoice.DueDate}\n\nThank you!`,
        attachments: [{ filename: `Invoice_${invoice.InvoiceID}.pdf`, content: pdfBuffer }]
      });
      return ok({ success: true });
    }

    // ── 404 fallback ───────────────────────────────────────────────────────────
    return err(404, `Route not found: ${method} ${path}`);

  } catch (e) {
    console.error('[api function error]', e);
    return err(500, e.message || 'Internal server error');
  }
};
