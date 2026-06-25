# Google Sheets Setup Guide

This guide walks you through getting your **Google Sheet ID**, **Service Account Email**, and **Credentials JSON Key** to connect the Invoice System.

---

## Step 1: Get Your Google Sheet ID

1. Open the Google Sheet you want to use in your browser.
2. Look at the URL in the address bar. It will look like this:
   `https://docs.google.com/spreadsheets/d/1a2B3c4D5e6F7g8H9i0J_klMnO-pQrStUvWxYz/edit#gid=0`
3. The long string of letters and numbers between `/d/` and `/edit` is your **Sheet ID**. 
   * In the example above, the Sheet ID is: `1a2B3c4D5e6F7g8H9i0J_klMnO-pQrStUvWxYz`

---

## Step 2: Create a Service Account & Download Key JSON

To let the application read and write to your Google Sheet securely, you need to create a service account on the Google Cloud Console.

### 1. Enable APIs in Google Cloud Console
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Invoice-System`) or select an existing one.
3. In the search bar at the top, search for **Google Sheets API** and click on it. Click **Enable**.
4. *(Optional)* Search for **Google Drive API** and click **Enable** (required if you want the app to automatically archive rendered PDFs into Google Drive).

### 2. Create the Service Account
1. Click the main navigation menu (three horizontal lines in top-left) and go to **IAM & Admin** -> **Service Accounts**.
2. Click **+ Create Service Account** at the top of the page.
3. Fill in the details:
   * **Service account name**: e.g., `invoice-sheets-connector`
   * Click **Create and Continue**.
4. In step 2 (*Grant roles*), click **Continue** (you do not need to assign project-level roles because sheet-level access is shared directly).
5. Click **Done**.

### 3. Copy Email and Generate Key JSON
1. You will see a list of service accounts. Locate the one you just created.
2. Copy the **Email Address** under the *Email* column. It will look like this:
   `invoice-sheets-connector@project-name-12345.iam.gserviceaccount.com`
   *(Save this: it is your **Service Account Email**).*
3. Click on the email address of the service account to edit its details.
4. Select the **Keys** tab at the top.
5. Click **Add Key** -> **Create new key**.
6. Select **JSON** as the key type and click **Create**.
7. A `.json` file will automatically download to your computer.
   * This is your **Service Account Key JSON**. You can open it in any text editor to copy its contents, or upload it directly in the app.

---

## Step 3: Link the Sheet with the Service Account

By default, the service account has no permission to access your files. You must share your sheet with it.

1. Open your Google Sheet.
2. Click the **Share** button in the top-right corner.
3. Paste the **Service Account Email** (copied in Step 2.3) in the "Add people and groups" input box.
4. Set their role to **Editor** (uncheck "Notify people" to avoid bouncing an email invitation).
5. Click **Share** (or **Send**).

Your Google Sheet is now a database! Paste the **Sheet ID** and the **JSON Key contents** into the application wizard to begin billing.
