const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// Path rewriter for Netlify Serverless environment
app.use((req, res, next) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    req.url = req.url.replace('/.netlify/functions/api', '/api');
  }
  next();
});

// Helper to get Google Sheets Client
async function getSheetsClient(req) {
  let email = req.headers['x-google-email'] || req.query.googleEmail;
  let privateKey = req.headers['x-google-key'] || req.query.googleKey;
  let sheetId = req.headers['x-sheet-id'] || req.query.sheetId;

  // Base64 decode private key if formatted that way to prevent headers newline issues
  if (privateKey && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    try {
      privateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
    } catch (e) {
      // Allow fallback
    }
  }

  // Fallback to Env variables
  if (!email) email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!privateKey) privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!sheetId) sheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !privateKey || !sheetId) {
    throw new Error('MISSING_CONFIG');
  }

  const formattedKey = privateKey
    .replace(/\r/g, '')
    .replace(/\\n/g, '\n')
    .trim();

  const auth = new google.auth.JWT({
    email,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return { sheets, sheetId };
}

// Convert sheet rows (2D array) to Array of Objects using headers row
function rowsToObjects(rows) {
  if (!rows || rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] !== undefined ? row[index] : '';
    });
    return obj;
  });
}

// Read raw values from spreadsheet range
async function getSheetValues(sheets, sheetId, range) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  return response.data.values || [];
}

// Append rows
async function appendRow(sheets, sheetId, tabName, headers, dataObject) {
  const rowArray = headers.map(header => dataObject[header] !== undefined ? dataObject[header] : '');
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tabName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowArray]
    }
  });
}

// Update specific row by key/value matching
async function updateRow(sheets, sheetId, tabName, keyColumnName, keyValue, headers, updatedFields) {
  const rangeName = `${tabName}!A:Z`;
  const rows = await getSheetValues(sheets, sheetId, rangeName);
  if (rows.length === 0) throw new Error(`Tab ${tabName} is empty.`);

  const headersRow = rows[0];
  const keyColIndex = headersRow.indexOf(keyColumnName);
  if (keyColIndex === -1) throw new Error(`Key column ${keyColumnName} not found in ${tabName}.`);

  let matchIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][keyColIndex] === keyValue) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex === -1) throw new Error(`Row with ${keyColumnName}=${keyValue} not found in ${tabName}.`);

  const currentRow = rows[matchIndex];
  const updatedRowArray = headersRow.map((header, idx) => {
    if (updatedFields[header] !== undefined) {
      return updatedFields[header];
    }
    return currentRow[idx] !== undefined ? currentRow[idx] : '';
  });

  const rowNumber = matchIndex + 1;
  const endLetter = String.fromCharCode(65 + headersRow.length - 1);
  const writeRange = `${tabName}!A${rowNumber}:${endLetter}${rowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: writeRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedRowArray]
    }
  });
}

// --- API Endpoints ---

// 1. Connection check & config verification
app.get('/api/check-connection', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    // Try to fetch settings tab metadata to check read permissions
    const rawSettings = await getSheetValues(sheets, sheetId, 'Settings!A:C');
    const settingsList = rowsToObjects(rawSettings);

    const configMap = {};
    settingsList.forEach(s => {
      configMap[s.Key] = s.Value;
    });

    res.json({
      connected: true,
      sheetId,
      companyName: configMap['company_name'] || 'Invoice System DB',
      settings: configMap
    });
  } catch (error) {
    console.error('Connection check failed:', error);
    if (error.message === 'MISSING_CONFIG') {
      return res.status(400).json({ connected: false, error: 'Configuration credentials missing. Set ENV or pass headers.' });
    }
    res.status(500).json({ connected: false, error: error.message || 'Failed to authenticate with Google Sheets.' });
  }
});

// 2. Fetch all Settings
app.get('/api/settings', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    const raw = await getSheetValues(sheets, sheetId, 'Settings!A:C');
    const settingsList = rowsToObjects(raw);
    const settingsMap = {};
    settingsList.forEach(item => {
      settingsMap[item.Key] = item.Value;
    });
    res.json(settingsMap);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Save Settings (bulk update settings tab)
app.post('/api/settings', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    const updatedSettings = req.body; // e.g. { company_name: "Arsa", bank_name: "BCA" }

    const raw = await getSheetValues(sheets, sheetId, 'Settings!A:C');
    const headers = raw[0] || ['Key', 'Value', 'Category'];

    for (const [key, value] of Object.entries(updatedSettings)) {
      try {
        await updateRow(sheets, sheetId, 'Settings', 'Key', key, headers, { Value: String(value) });
      } catch (e) {
        // If row doesn't exist, append it
        await appendRow(sheets, sheetId, 'Settings', headers, { Key: key, Value: String(value), Category: 'General' });
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Fetch Customers
app.get('/api/customers', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    const raw = await getSheetValues(sheets, sheetId, 'Customers!A:F');
    res.json(rowsToObjects(raw));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Create / Update Customer
app.post('/api/customers', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    const customer = req.body;
    const raw = await getSheetValues(sheets, sheetId, 'Customers!A:F');
    const headers = raw[0] || ['CustomerID', 'Name', 'Email', 'Phone', 'Address', 'Website'];

    if (!customer.CustomerID) {
      customer.CustomerID = 'CUST-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }

    // Check if customer exists
    const customerList = rowsToObjects(raw);
    const exists = customerList.some(c => c.CustomerID === customer.CustomerID);

    if (exists) {
      await updateRow(sheets, sheetId, 'Customers', 'CustomerID', customer.CustomerID, headers, customer);
    } else {
      await appendRow(sheets, sheetId, 'Customers', headers, customer);
    }

    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Fetch Services
app.get('/api/services', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    const raw = await getSheetValues(sheets, sheetId, 'Services!A:D');
    res.json(rowsToObjects(raw));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Create / Update Service
app.post('/api/services', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    const service = req.body;
    const raw = await getSheetValues(sheets, sheetId, 'Services!A:D');
    const headers = raw[0] || ['ServiceID', 'Description', 'Unit', 'DefaultCost'];

    if (!service.ServiceID) {
      service.ServiceID = 'SRV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    }

    const servicesList = rowsToObjects(raw);
    const exists = servicesList.some(s => s.ServiceID === service.ServiceID);

    if (exists) {
      await updateRow(sheets, sheetId, 'Services', 'ServiceID', service.ServiceID, headers, service);
    } else {
      await appendRow(sheets, sheetId, 'Services', headers, service);
    }

    res.json({ success: true, service });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Fetch Invoices with Items embedded
app.get('/api/invoices', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    
    // Read raw invoices & raw invoice items
    const rawInvoices = await getSheetValues(sheets, sheetId, 'Invoices!A:M');
    const invoices = rowsToObjects(rawInvoices);

    const rawItems = await getSheetValues(sheets, sheetId, 'InvoiceItems!A:G');
    const items = rowsToObjects(rawItems);

    const rawCustomers = await getSheetValues(sheets, sheetId, 'Customers!A:F');
    const customers = rowsToObjects(rawCustomers);
    const customerMap = {};
    customers.forEach(c => {
      customerMap[c.CustomerID] = c;
    });

    // Nest items inside invoices
    const enrichedInvoices = invoices.map(invoice => {
      const invoiceItems = items.filter(item => item.InvoiceID === invoice.InvoiceID);
      const customer = customerMap[invoice.CustomerID] || { Name: invoice.CustomerID };
      return {
        ...invoice,
        Customer: customer,
        Items: invoiceItems
      };
    });

    // Return newest first by default
    res.json(enrichedInvoices.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Create New Invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    const { invoiceData, items } = req.body; 
    // invoiceData: { IssueDate, DueDate, PaymentTerms, CustomerID, Subtotal, Discount, TaxRate, TaxAmount, Total, Status, Notes, PDFUrl }
    // items: [ { Description, QTY, Unit, Cost, Amount } ]

    // 1. Generate InvoiceID if not provided
    if (!invoiceData.InvoiceID) {
      const rawInvoices = await getSheetValues(sheets, sheetId, 'Invoices!A:M');
      const invoiceList = rowsToObjects(rawInvoices);
      const count = invoiceList.length + 1;
      invoiceData.InvoiceID = `INV-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
    }

    // 2. Add Invoice Metadata
    const rawInvoices = await getSheetValues(sheets, sheetId, 'Invoices!A:M');
    const invoiceHeaders = rawInvoices[0] || [
      'InvoiceID', 'IssueDate', 'DueDate', 'PaymentTerms', 'CustomerID', 
      'Subtotal', 'Discount', 'TaxRate', 'TaxAmount', 'Total', 'Status', 'Notes', 'PDFUrl'
    ];
    invoiceData.Status = invoiceData.Status || 'Sent';
    await appendRow(sheets, sheetId, 'Invoices', invoiceHeaders, invoiceData);

    // 3. Add Invoice Line Items
    const rawItems = await getSheetValues(sheets, sheetId, 'InvoiceItems!A:G');
    const itemHeaders = rawItems[0] || ['ItemID', 'InvoiceID', 'Description', 'QTY', 'Unit', 'Cost', 'Amount'];

    for (const item of items) {
      const ItemID = 'ITEM-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      const amount = Number(item.QTY) * Number(item.Cost);
      await appendRow(sheets, sheetId, 'InvoiceItems', itemHeaders, {
        ItemID,
        InvoiceID: invoiceData.InvoiceID,
        Description: item.Description,
        QTY: item.QTY,
        Unit: item.Unit || 'page',
        Cost: item.Cost,
        Amount: amount
      });
    }

    res.json({ success: true, InvoiceID: invoiceData.InvoiceID });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Update Invoice Status
app.patch('/api/invoices/:id/status', async (req, res) => {
  try {
    const { sheets, sheetId } = await getSheetsClient(req);
    const invoiceId = req.params.id;
    const { status } = req.body; // 'Draft' | 'Sent' | 'Paid' | 'Overdue'

    const raw = await getSheetValues(sheets, sheetId, 'Invoices!A:M');
    const headers = raw[0];

    await updateRow(sheets, sheetId, 'Invoices', 'InvoiceID', invoiceId, headers, { Status: status });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Send Invoice Email
app.post('/api/invoices/send-email', async (req, res) => {
  try {
    const { invoice, pdfDataUri, emailConfig } = req.body;
    // invoice: { InvoiceID, Customer: { Name, Email }, Total, IssueDate, DueDate, Items: [...] }
    // pdfDataUri: base64 data URI of the generated invoice PDF (generated on client side)
    // emailConfig: SMTP options or Resend configuration passed from settings

    // We configure transport based on emailConfig or fall back to system env
    const host = emailConfig?.host || process.env.SMTP_HOST;
    const port = emailConfig?.port || process.env.SMTP_PORT || 587;
    const user = emailConfig?.user || process.env.SMTP_USER;
    const pass = emailConfig?.pass || process.env.SMTP_PASS;

    if (!user || !pass) {
      return res.status(400).json({ error: 'Mail server credentials are not configured.' });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass }
    });

    const pdfBuffer = Buffer.from(pdfDataUri.split(',')[1], 'base64');

    const mailOptions = {
      from: emailConfig?.from || `Billing <${user}>`,
      to: invoice.Customer.Email,
      subject: `Invoice ${invoice.InvoiceID} from ${emailConfig?.companyName || 'Us'}`,
      text: `Hello ${invoice.Customer.Name},\n\nPlease find attached your invoice ${invoice.InvoiceID} for the total of ${invoice.Total}.\n\nIssue Date: ${invoice.IssueDate}\nDue Date: ${invoice.DueDate}\n\nThank you for your business!`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #0f172a;">Invoice ${invoice.InvoiceID}</h2>
          <p>Hello ${invoice.Customer.Name},</p>
          <p>Thank you for your business. Please find your invoice attached as a PDF file.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Issue Date:</td>
              <td style="padding: 8px 0;">${invoice.IssueDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Due Date:</td>
              <td style="padding: 8px 0; color: #b91c1c;">${invoice.DueDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Total Amount:</td>
              <td style="padding: 8px 0; font-size: 1.2em; font-weight: bold; color: #0f172a;">${invoice.Total}</td>
            </tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 0.9em; color: #666;">If you have any questions, feel free to reply directly to this email.</p>
        </div>
      `,
      attachments: [
        {
          filename: `Invoice_${invoice.InvoiceID}.pdf`,
          content: pdfBuffer
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Mail sending error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Wrap express server in Serverless Handler
module.exports.handler = serverless(app);
