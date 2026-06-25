# Google Sheets Database Setup Guide

This document describes how to structure your Google Sheet to act as the database for the Invoice System. 

To use this, create a new Google Sheet, name it (e.g. `My Invoice DB`), and create five sheets (tabs) with the exact column headers specified below.

---

## 1. Sheet Structure (Tabs & Columns)

### Tab 1: `Settings`
This tab holds your brand identity, contact information, and default payment terms. It acts as your application settings panel.

| Column Header | Description | Example Value |
| :--- | :--- | :--- |
| `Key` | Unique key name used by the backend code | `company_name` |
| `Value` | The value configured for this setting | `Studio Arsa Digital` |
| `Category` | Organization category (Branding, Billing, Bank, Tax) | `Branding` |

**Recommended Rows to Populate:**
*   `company_name`: `Studio Arsa Digital`
*   `company_logo`: `https://yourdomain.com/logo.png` (URL to your brand logo)
*   `company_email`: `billing@arsa.digital`
*   `company_phone`: `+62 812-3456-7890`
*   `company_address`: `Jl. Jambu No 5, Semanding, Sumbersekar, Malang, Indonesia`
*   `company_website`: `https://arsa.digital`
*   `bank_name`: `Bank Central Asia (BCA)`
*   `bank_account_name`: `Studio Arsa Digital`
*   `bank_account_number`: `1234567890`
*   `bank_routing_code`: `BCAIDJAxxx` (optional)
*   `default_currency`: `IDR` (or USD, EUR, etc.)
*   `default_tax_rate`: `0.11` (represents 11%)
*   `default_payment_terms`: `Net 14` (e.g., Net 7, Net 14, Net 30, Due on Receipt)
*   `invoice_prefix`: `INV-`
*   `color_primary`: `#0f172a` (Hex code for buttons, accents - slate dark)
*   `color_secondary`: `#f8fafc` (Hex code for backgrounds)

---

### Tab 2: `Customers`
Stores client details. When building an invoice, selecting a customer will autocomplete their billing details.

| Column Header | Data Type | Description | Example Value |
| :--- | :--- | :--- | :--- |
| `CustomerID` | String (Unique) | Short slug or ID | `CUST-NUSANTARA` |
| `Name` | String | Customer Company or Individual Name | `PT Nusantara Digital Solusi` |
| `Email` | String | Client email for sending invoices | `billing@nusantara.co.id` |
| `Phone` | String | Contact number | `+62 21-555-0199` |
| `Address` | String | Full billing address | `Jl. Jendral Sudirman No. 45 Jakarta Selatan, DKI Jakarta 12190` |
| `Website` | String | Customer website URL | `https://nusantara.co.id` |

---

### Tab 3: `Services`
Stores your standard items, hourly rates, or packages. Helps autocomplete item rows when building invoices.

| Column Header | Data Type | Description | Example Value |
| :--- | :--- | :--- | :--- |
| `ServiceID` | String (Unique) | Short ID for code reference | `SRV-UI-DESIGN` |
| `Description` | String | Default description/title | `Dashboard UI Design` |
| `Unit` | String | e.g. page, hour, flat, project | `page` |
| `DefaultCost` | Number | Base cost per unit | `750000` |

---

### Tab 4: `Invoices`
Stores metadata and summarized figures for each invoice.

| Column Header | Data Type | Description | Example Value |
| :--- | :--- | :--- | :--- |
| `InvoiceID` | String (Unique) | Invoice code (e.g., Prefix + Number) | `INV-2026-0001` |
| `IssueDate` | Date (YYYY-MM-DD) | Date invoice was created | `2026-01-29` |
| `DueDate` | Date (YYYY-MM-DD) | Payment due date | `2026-02-12` |
| `PaymentTerms` | String | Terms code | `Net 14` |
| `CustomerID` | String | Matches `CustomerID` in Customers tab | `CUST-NUSANTARA` |
| `Subtotal` | Number | Sum of item totals before discount/tax | `12500000` |
| `Discount` | Number | Flat discount deduction | `500000` |
| `TaxRate` | Number | Tax rate fraction | `0.11` |
| `TaxAmount` | Number | Subtotal * TaxRate | `1375000` |
| `Total` | Number | (Subtotal - Discount) + TaxAmount | `13375000` |
| `Status` | String | `Draft`, `Sent`, `Paid`, `Overdue` | `Sent` |
| `Notes` | String | Extra customer-facing note | `Thank you for your trust.` |
| `PDFUrl` | String (URL) | Link to saved PDF in Google Drive | `https://drive.google.com/...` |

---

### Tab 5: `InvoiceItems`
Stores line items. Each invoice has one or more rows here linked via `InvoiceID`.

| Column Header | Data Type | Description | Example Value |
| :--- | :--- | :--- | :--- |
| `ItemID` | String (Unique) | Automatically generated ID | `ITEM-98124` |
| `InvoiceID` | String | Links to `InvoiceID` in Invoices tab | `INV-2026-0001` |
| `Description` | String | Line item details | `Dashboard UI Design` |
| `QTY` | Number | Quantity purchased | `10` |
| `Unit` | String | Item unit type | `page` |
| `Cost` | Number | Unit price | `750000` |
| `Amount` | Number | QTY * Cost | `7500000` |

---

## 2. Google Sheets Setup AI Prompt

Copy and paste the prompt below into Google Gemini, ChatGPT, or Claude to quickly generate a ready-to-run Google Apps Script that creates this entire structure automatically.

```text
Create a Google Apps Script that builds a complete database structure for an invoice system. The script should:
1. Create five tabs: "Settings", "Customers", "Services", "Invoices", and "InvoiceItems".
2. Add bold header rows for each tab as follows:
   - Settings: Key, Value, Category
   - Customers: CustomerID, Name, Email, Phone, Address, Website
   - Services: ServiceID, Description, Unit, DefaultCost
   - Invoices: InvoiceID, IssueDate, DueDate, PaymentTerms, CustomerID, Subtotal, Discount, TaxRate, TaxAmount, Total, Status, Notes, PDFUrl
   - InvoiceItems: ItemID, InvoiceID, Description, QTY, Unit, Cost, Amount
3. Format the header rows: light gray background color, bold text, and a thin border underneath.
4. Auto-resize columns so they are clean and readable.
5. Populate 2-3 rows of realistic sample data for each tab using Studio Arsa Digital as the company and PT Nusantara Digital Solusi as the customer, using values that align (e.g. sample items in InvoiceItems should total up to the amounts in the Invoices tab).
Please output just the Google Apps Script.
```

---

## 3. How Customers Rehost & Link

When custom clients/brands spin up another instance of the system:
1.  **Clone Sheet Template**: They copy the master Google Sheet template using their own Google account.
2.  **Get Sheet ID**: They copy the ID from the browser URL:
    `https://docs.google.com/spreadsheets/d/`**[SPREADSHEET_ID]**`/edit`
3.  **Share with Service Account**: They share the spreadsheet with viewer/editor permissions to the Service Account email (e.g. `your-service-account@your-project.iam.gserviceaccount.com`).
4.  **Connect in App Panel**: They input the `Sheet ID` in the setup wizard of the invoice system frontend. The app immediately begins querying and rendering their custom settings, customer directory, and invoices.
