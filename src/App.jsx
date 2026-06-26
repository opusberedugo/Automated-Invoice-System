import { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Users, 
  Settings as SettingsIcon, 
  Plus, 
  Trash2, 
  Download, 
  Send, 
  Check, 
  AlertCircle, 
  Database, 
  RefreshCw, 
  Briefcase, 
  Layers, 
  Printer, 
  ArrowLeft, 
  Mail, 
  Info,
  LogOut
} from 'lucide-react';
import './App.css';

// Base API configuration
const API_BASE = import.meta.env.VITE_API_BASE || ''; // proxied to Netlify dev or serverless function path or Render URL

// Safe JSON parser — prevents crash when Netlify returns an HTML error page instead of JSON
async function safeJson(res) {
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    throw new Error(`Server error (HTTP ${res.status}): API returned an HTML page instead of JSON. Check Netlify function logs.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from server (HTTP ${res.status}): ${text.slice(0, 120)}`);
  }
}

export default function App() {
  // Connection states
  const [connection, setConnection] = useState(() => {
    const saved = localStorage.getItem('invoice_db_connection');
    return saved ? JSON.parse(saved) : null;
  });

  const [wizardData, setWizardData] = useState({
    sheetId: '',
    googleEmail: '',
    googleKey: ''
  });

  // App core states
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [settings, setSettings] = useState({});
  
  // UI States
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [wizardSuccess, setWizardSuccess] = useState('');
  const [globalNotification, setGlobalNotification] = useState(null);

  // Connection Headers Helper
  const getHeaders = () => {
    if (!connection) return {};
    return {
      'x-sheet-id': connection.sheetId,
      'x-google-email': connection.googleEmail,
      'x-google-key': connection.googleKey,
      'Content-Type': 'application/json'
    };
  };

  // Fetch core data from Google Sheet
  const fetchAllData = async () => {
    if (!connection) return;
    setIsLoading(true);
    try {
      const headers = getHeaders();
      
      // Fetch settings
      const settingsRes = await fetch(`${API_BASE}/api/settings`, { headers });
      const settingsData = await safeJson(settingsRes);
      if (settingsData.error) throw new Error(settingsData.error);
      setSettings(settingsData);

      // Fetch customers
      const customersRes = await fetch(`${API_BASE}/api/customers`, { headers });
      const customersData = await safeJson(customersRes);
      setCustomers(customersData);

      // Fetch services
      const servicesRes = await fetch(`${API_BASE}/api/services`, { headers });
      const servicesData = await safeJson(servicesRes);
      setServices(servicesData);

      // Fetch invoices
      const invoicesRes = await fetch(`${API_BASE}/api/invoices`, { headers });
      const invoicesData = await safeJson(invoicesRes);
      setInvoices(invoicesData);

      showNotification('success', 'Data synced with Google Sheets');
    } catch (err) {
      console.error(err);
      showNotification('error', `Sync failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (connection) {
      fetchAllData();
    }
  }, [connection]);

  // Inject primary brand color into HTML styles
  useEffect(() => {
    if (settings.color_primary) {
      document.documentElement.style.setProperty('--primary', settings.color_primary);
    }
    if (settings.color_secondary) {
      document.documentElement.style.setProperty('--bg-app', settings.color_secondary);
    }
  }, [settings]);

  const showNotification = (type, message) => {
    setGlobalNotification({ type, message });
    setTimeout(() => setGlobalNotification(null), 4000);
  };

  // Handle connection submit in setup wizard
  const handleConnect = async (e) => {
    e.preventDefault();
    setWizardError('');
    setWizardSuccess('');
    setIsLoading(true);

    try {
      let sheetId = wizardData.sheetId.trim();
      let email = wizardData.googleEmail.trim();
      let key = wizardData.googleKey.trim();

      if (key.startsWith('{')) {
        // User pasted service account JSON
        try {
          const parsed = JSON.parse(key);
          if (parsed.private_key && parsed.client_email) {
            email = parsed.client_email;
            key = parsed.private_key;
          } else {
            throw new Error('Pasted JSON does not contain private_key or client_email.');
          }
        } catch (je) {
          throw new Error('Invalid JSON format. Please verify file contents.');
        }
      }

      if (!sheetId || !email || !key) {
        throw new Error('All connection fields are required.');
      }

      // Always base64 encode key to safely transmit via HTTP headers
      const encodedKey = btoa(key.replace(/\r/g, '').trim());

      await testConnection(sheetId, email, encodedKey);
    } catch (err) {
      setWizardError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async (sheetId, email, encodedKey) => {
    const res = await fetch(`${API_BASE}/api/check-connection`, {
      headers: {
        'x-sheet-id': sheetId,
        'x-google-email': email,
        'x-google-key': encodedKey
      }
    });
    const data = await safeJson(res);
    if (!data.connected) {
      throw new Error(data.error || 'Failed to connect. Please verify Google Sheet ID and share settings.');
    }
    
    const connObj = { sheetId, googleEmail: email, googleKey: encodedKey };
    localStorage.setItem('invoice_db_connection', JSON.stringify(connObj));
    setWizardSuccess(`Successfully connected to sheet!`);
    setTimeout(() => {
      setConnection(connObj);
      setWizardSuccess('');
    }, 1000);
  };

  const handleDisconnect = () => {
    if (confirm('Disconnect from current Google Sheet database? All local configs will be cleared.')) {
      localStorage.removeItem('invoice_db_connection');
      setConnection(null);
      setInvoices([]);
      setCustomers([]);
      setServices([]);
      setSettings({});
      setCurrentTab('dashboard');
    }
  };

  if (!connection) {
    return (
      <div className="wizard-box">
        <div className="logo-container" style={{ justifyContent: 'center', marginBottom: '10px' }}>
          <div className="logo-icon">A</div>
          <span>Arsa Billing Setup</span>
        </div>
        <h2 className="wizard-title">Connect Google Sheets</h2>
        <p className="wizard-desc">
          Link your Google Sheet database. Share your spreadsheet with the service account email as <strong>Editor</strong>.
        </p>

        {wizardError && <div className="wizard-status error"><AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{wizardError}</div>}
        {wizardSuccess && <div className="wizard-status success"><Check size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{wizardSuccess}</div>}

        <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label htmlFor="sheetId">Google Sheet ID <span className="required">*</span></label>
            <input 
              type="text" 
              id="sheetId" 
              className="input-control" 
              placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
              value={wizardData.sheetId}
              onChange={e => setWizardData(prev => ({ ...prev, sheetId: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="wizardCreds">Paste Service Account Key JSON <span className="required">*</span></label>
            <textarea 
              id="wizardCreds" 
              className="input-control" 
              style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '0.8rem' }}
              placeholder='Paste full credentials JSON file contents here, or type raw keys below...'
              value={wizardData.googleKey}
              onChange={e => {
                const val = e.target.value;
                if (val.startsWith('{')) {
                  setWizardData(prev => ({ ...prev, googleKey: val }));
                } else {
                  setWizardData(prev => ({ ...prev, googleKey: val }));
                }
              }}
              required
            />
          </div>

          <div className="form-group" style={{ opacity: wizardData.googleKey.startsWith('{') ? 0.4 : 1 }}>
            <label htmlFor="googleEmail">Service Account Email</label>
            <input 
              type="email" 
              id="googleEmail" 
              className="input-control" 
              placeholder="your-service-account@project.iam.gserviceaccount.com"
              value={wizardData.googleEmail}
              onChange={e => setWizardData(prev => ({ ...prev, googleEmail: e.target.value }))}
              disabled={wizardData.googleKey.startsWith('{')}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '12px', marginTop: '8px' }}
            disabled={isLoading}
          >
            {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <Database size={18} />}
            Connect Database
          </button>
        </form>
        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px' }}>
          <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Create Service Account in Google Console</a>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="navbar">
        <div className="logo-container">
          <div className="logo-icon">{settings.company_name ? settings.company_name[0] : 'A'}</div>
          <div>
            <div>{settings.company_name || 'Arsa Billing'}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Connected sheets database</div>
          </div>
        </div>

        <nav className="nav-links">
          <div 
            className={`nav-link ${currentTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentTab('dashboard')}
          >
            Dashboard
          </div>
          <div 
            className={`nav-link ${currentTab === 'create-invoice' ? 'active' : ''}`}
            onClick={() => setCurrentTab('create-invoice')}
          >
            Invoices
          </div>
          <div 
            className={`nav-link ${currentTab === 'customers' ? 'active' : ''}`}
            onClick={() => setCurrentTab('customers')}
          >
            Customers
          </div>
          <div 
            className={`nav-link ${currentTab === 'services' ? 'active' : ''}`}
            onClick={() => setCurrentTab('services')}
          >
            Services
          </div>
          <div 
            className={`nav-link ${currentTab === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentTab('settings')}
          >
            Settings
          </div>
        </nav>

        <div className="nav-actions">
          <button className="btn btn-secondary" onClick={fetchAllData} disabled={isLoading} title="Sync database">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Sync
          </button>
          <button className="btn btn-danger" onClick={handleDisconnect} title="Disconnect sheet">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {globalNotification && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: globalNotification.type === 'success' ? '#15803d' : '#b91c1c',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem',
          fontWeight: 500
        }}>
          {globalNotification.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          {globalNotification.message}
        </div>
      )}

      <main className="app-container">
        {currentTab === 'dashboard' && (
          <DashboardView 
            invoices={invoices} 
            settings={settings} 
            onNavigate={() => setCurrentTab('create-invoice')} 
            headers={getHeaders()}
            refreshData={fetchAllData}
            showNotification={showNotification}
          />
        )}
        {currentTab === 'create-invoice' && (
          <InvoiceBuilderView 
            customers={customers} 
            services={services} 
            settings={settings} 
            headers={getHeaders()}
            refreshData={fetchAllData}
            showNotification={showNotification}
            onBack={() => setCurrentTab('dashboard')}
          />
        )}
        {currentTab === 'customers' && (
          <CustomersView 
            customers={customers} 
            headers={getHeaders()}
            refreshData={fetchAllData}
            showNotification={showNotification}
          />
        )}
        {currentTab === 'services' && (
          <ServicesView 
            services={services} 
            headers={getHeaders()}
            refreshData={fetchAllData}
            showNotification={showNotification}
          />
        )}
        {currentTab === 'settings' && (
          <SettingsView 
            settings={settings} 
            headers={getHeaders()}
            refreshData={fetchAllData}
            showNotification={showNotification}
          />
        )}
      </main>
    </>
  );
}

// --- SUBVIEWS ---

// 1. Dashboard View
function DashboardView({ invoices, settings, onNavigate, headers, refreshData, showNotification }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(null);

  // Compute metrics
  const metrics = useMemo(() => {
    let outstanding = 0;
    let paid = 0;
    let overdue = 0;
    let draft = 0;
    const now = new Date();

    invoices.forEach(inv => {
      const total = parseFloat(inv.Total || 0);
      const isOverdue = new Date(inv.DueDate) < now && inv.Status !== 'Paid';
      
      if (inv.Status === 'Paid') {
        paid += total;
      } else if (inv.Status === 'Draft') {
        draft += total;
      } else {
        outstanding += total;
        if (isOverdue) overdue += total;
      }
    });

    const formatCurrency = (val) => {
      const cur = settings.default_currency || 'USD';
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val);
    };

    return {
      outstanding: formatCurrency(outstanding),
      paid: formatCurrency(paid),
      overdue: formatCurrency(overdue),
      draftCount: invoices.filter(i => i.Status === 'Draft').length
    };
  }, [invoices, settings]);

  // Filter list
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch = 
        inv.InvoiceID.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (inv.Customer?.Name || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'All' || inv.Status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchTerm, statusFilter]);

  const handleUpdateStatus = async (invoiceId, currentStatus) => {
    const nextStatusMap = {
      'Draft': 'Sent',
      'Sent': 'Paid',
      'Paid': 'Draft'
    };
    const nextStatus = nextStatusMap[currentStatus] || 'Draft';
    setIsUpdatingStatus(invoiceId);

    try {
      const res = await fetch(`${API_BASE}/api/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        showNotification('success', `Invoice ${invoiceId} updated to ${nextStatus}`);
        refreshData();
      } else {
        throw new Error('Update failed');
      }
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.75rem' }}>Invoice History</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Manage your clients and trace financial logs</p>
        </div>
        <button className="btn btn-primary" onClick={onNavigate}>
          <Plus size={16} />
          Create Invoice
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Unpaid Outstanding</span>
          <span className="stat-value">{metrics.outstanding}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Revenue Collected (Paid)</span>
          <span className="stat-value" style={{ color: '#16a34a' }}>{metrics.paid}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Overdue Invoices</span>
          <span className="stat-value" style={{ color: '#dc2626' }}>{metrics.overdue}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Draft Total Items</span>
          <span className="stat-value" style={{ color: 'var(--text-muted)' }}>{metrics.draftCount} bills</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-inputs">
          <input 
            type="text" 
            placeholder="Search by ID or customer name..." 
            className="input-control"
            style={{ minWidth: '240px' }}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <select 
            className="input-control"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Sent">Sent</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
          </select>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
          Showing {filteredInvoices.length} invoices
        </span>
      </div>

      {/* Data Table */}
      <div className="table-container">
        {filteredInvoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <FileText size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p>No invoices found matching criteria.</p>
          </div>
        ) : (
          <table className="table-invoices">
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.InvoiceID}>
                  <td style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{invoice.InvoiceID}</td>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--text-dark)' }}>{invoice.Customer?.Name || invoice.CustomerID}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{invoice.Customer?.Email}</div>
                  </td>
                  <td>{invoice.IssueDate}</td>
                  <td style={{ color: new Date(invoice.DueDate) < new Date() && invoice.Status !== 'Paid' ? '#ef4444' : 'inherit' }}>
                    {invoice.DueDate}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-dark)' }}>
                    {new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.default_currency || 'USD', maximumFractionDigits: 0 }).format(invoice.Total)}
                  </td>
                  <td>
                    <span 
                      className={`badge badge-${invoice.Status?.toLowerCase()}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleUpdateStatus(invoice.InvoiceID, invoice.Status)}
                      title="Click to toggle status"
                    >
                      {isUpdatingStatus === invoice.InvoiceID ? 'Updating...' : invoice.Status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                        onClick={() => {
                          // Client-side print target
                          window.print();
                        }}
                      >
                        <Printer size={12} />
                        Print
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// 2. Invoice Builder Component
function InvoiceBuilderView({ customers, services, settings, headers, refreshData, showNotification, onBack }) {
  const [invoice, setInvoice] = useState({
    CustomerID: '',
    IssueDate: new Date().toISOString().split('T')[0],
    DueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // default +14 days
    PaymentTerms: settings.default_payment_terms || 'Net 14',
    Discount: 0,
    TaxRate: parseFloat(settings.default_tax_rate || 0.11),
    Notes: 'Thank you for your business. Please complete the payment before the due date.'
  });

  const [items, setItems] = useState([
    { Description: '', QTY: 1, Unit: 'page', Cost: 0 }
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [selectedCustDetails, setSelectedCustDetails] = useState(null);

  // Sync customer details selection
  useEffect(() => {
    const cust = customers.find(c => c.CustomerID === invoice.CustomerID);
    setSelectedCustDetails(cust || null);
  }, [invoice.CustomerID, customers]);

  // Compute invoice financial calculations
  const finances = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.QTY || 0) * Number(item.Cost || 0)), 0);
    const discount = Number(invoice.Discount || 0);
    const taxAmount = (subtotal - discount) * Number(invoice.TaxRate || 0);
    const total = (subtotal - discount) + taxAmount;
    
    return {
      subtotal,
      taxAmount,
      total
    };
  }, [items, invoice.Discount, invoice.TaxRate]);

  const handleAddItem = () => {
    setItems(prev => [...prev, { Description: '', QTY: 1, Unit: 'page', Cost: 0 }]);
  };

  const handleRemoveItem = (index) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      
      // If service selection changes, update description and unit price automatically
      if (field === 'Description') {
        const foundSrv = services.find(s => s.Description === value);
        if (foundSrv) {
          updated.Cost = parseFloat(foundSrv.DefaultCost || 0);
          updated.Unit = foundSrv.Unit || 'page';
        }
      }
      return updated;
    }));
  };

  const handleSaveInvoice = async (status = 'Sent') => {
    if (!invoice.CustomerID) {
      alert('Please select a customer.');
      return;
    }
    if (items.some(item => !item.Description || item.Cost <= 0)) {
      alert('Please fill out descriptions and unit prices for all items.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        invoiceData: {
          IssueDate: invoice.IssueDate,
          DueDate: invoice.DueDate,
          PaymentTerms: invoice.PaymentTerms,
          CustomerID: invoice.CustomerID,
          Subtotal: finances.subtotal,
          Discount: invoice.Discount,
          TaxRate: invoice.TaxRate,
          TaxAmount: finances.taxAmount,
          Total: finances.total,
          Status: status,
          Notes: invoice.Notes,
          PDFUrl: ''
        },
        items: items
      };

      const res = await fetch(`${API_BASE}/api/invoices`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await safeJson(res);
      if (data.success) {
        showNotification('success', `Created Invoice: ${data.InvoiceID}`);
        refreshData();
        onBack();
      } else {
        throw new Error(data.error || 'Server error creating invoice.');
      }
    } catch (e) {
      showNotification('error', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.default_currency || 'USD', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button className="btn btn-secondary" onClick={onBack} style={{ padding: '8px' }}>
          <ArrowLeft size={16} />
        </button>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem' }}>Create New Invoice</h1>
      </div>

      <div className="creator-container">
        {/* Left Form Settings */}
        <div className="creator-panel-left">
          
          <div className="form-section">
            <h3 className="form-section-title">Client Details</h3>
            <div className="form-group">
              <label>Select Customer <span className="required">*</span></label>
              <select 
                className="input-control"
                value={invoice.CustomerID}
                onChange={e => setInvoice(prev => ({ ...prev, CustomerID: e.target.value }))}
              >
                <option value="">-- Choose Client --</option>
                {customers.map(c => (
                  <option key={c.CustomerID} value={c.CustomerID}>{c.Name}</option>
                ))}
              </select>
            </div>
            {selectedCustDetails && (
              <div style={{ fontSize: '0.8rem', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px', color: 'var(--text-muted)' }}>
                <strong>Address: </strong>{selectedCustDetails.Address}<br/>
                <strong>Email: </strong>{selectedCustDetails.Email}
              </div>
            )}
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Invoice Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Issue Date</label>
                <input 
                  type="date" 
                  className="input-control" 
                  value={invoice.IssueDate}
                  onChange={e => setInvoice(prev => ({ ...prev, IssueDate: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input 
                  type="date" 
                  className="input-control" 
                  value={invoice.DueDate}
                  onChange={e => setInvoice(prev => ({ ...prev, DueDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Payment Terms</label>
              <select 
                className="input-control"
                value={invoice.PaymentTerms}
                onChange={e => setInvoice(prev => ({ ...prev, PaymentTerms: e.target.value }))}
              >
                <option value="Net 7">Net 7</option>
                <option value="Net 14">Net 14</option>
                <option value="Net 30">Net 30</option>
                <option value="Due on Receipt">Due on Receipt</option>
              </select>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Line Items</h3>
            <table className="items-builder-table">
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>Description</th>
                  <th style={{ width: '15%' }}>Qty</th>
                  <th style={{ width: '25%' }}>Unit Price</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Total</th>
                  <th style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <input 
                        type="text" 
                        list="services-list"
                        placeholder="Search or enter item name..." 
                        className="input-control"
                        style={{ width: '100%' }}
                        value={item.Description}
                        onChange={e => handleItemChange(idx, 'Description', e.target.value)}
                      />
                      <datalist id="services-list">
                        {services.map(s => (
                          <option key={s.ServiceID} value={s.Description} />
                        ))}
                      </datalist>
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="input-control" 
                        style={{ width: '100%' }}
                        min="1"
                        value={item.QTY}
                        onChange={e => handleItemChange(idx, 'QTY', parseInt(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="input-control" 
                        style={{ width: '100%' }}
                        placeholder="Price"
                        value={item.Cost}
                        onChange={e => handleItemChange(idx, 'Cost', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-dark)', fontSize: '0.85rem' }}>
                      {formatCurrency(Number(item.QTY || 0) * Number(item.Cost || 0))}
                    </td>
                    <td>
                      <button className="btn-remove-item" onClick={() => handleRemoveItem(idx)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary" onClick={handleAddItem} style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
              <Plus size={14} />
              Add Item
            </button>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Discounts & Notes</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Discount Value</label>
                <input 
                  type="number" 
                  className="input-control" 
                  value={invoice.Discount}
                  onChange={e => setInvoice(prev => ({ ...prev, Discount: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="form-group">
                <label>Tax Rate (PPN/VAT %)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="input-control" 
                  value={invoice.TaxRate}
                  onChange={e => setInvoice(prev => ({ ...prev, TaxRate: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Notes to Customer</label>
              <textarea 
                className="input-control" 
                rows="3"
                value={invoice.Notes}
                onChange={e => setInvoice(prev => ({ ...prev, Notes: e.target.value }))}
              />
            </div>
          </div>

        </div>

        {/* Right Preview Panel (Sticky & Live A4 Invoice Sheet) */}
        <div className="creator-panel-right">
          <div className="invoice-preview-card">
            <div className="invoice-preview-header">
              <span style={{ fontWeight: 600, color: 'var(--text-dark)' }}>Live PDF Layout</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => handleSaveInvoice('Draft')} disabled={isSaving}>
                  Save Draft
                </button>
                <button className="btn btn-primary" onClick={() => handleSaveInvoice('Sent')} disabled={isSaving}>
                  <Send size={14} />
                  Send Invoice
                </button>
              </div>
            </div>

            {/* A4 Paper Template */}
            <div className="invoice-paper" id="invoice-paper-element">
              
              <div className="paper-header">
                <div>
                  {settings.company_logo ? (
                    <img src={settings.company_logo} alt="Company logo" className="paper-logo" />
                  ) : (
                    <div className="paper-logo-fallback">{settings.company_name ? settings.company_name[0] : 'A'}</div>
                  )}
                </div>
                <div className="paper-meta">
                  <div className="paper-title">INVOICE</div>
                  <div className="paper-invoice-num">#INV-YYYY-XXXX</div>
                </div>
              </div>

              <div className="paper-dates-grid">
                <div>
                  <div className="date-block-title">Issue Date</div>
                  <div className="date-block-val">{invoice.IssueDate}</div>
                </div>
                <div>
                  <div className="date-block-title">Due Date</div>
                  <div className="date-block-val" style={{ fontWeight: 600 }}>{invoice.DueDate}</div>
                </div>
                <div>
                  <div className="date-block-title">Payment Terms</div>
                  <div className="date-block-val">{invoice.PaymentTerms}</div>
                </div>
              </div>

              <div className="paper-billing-grid">
                <div>
                  <div className="bill-title">Billed By</div>
                  <div className="bill-name">{settings.company_name || 'My Brand Name'}</div>
                  <div className="bill-address">
                    {settings.company_address}<br/>
                    {settings.company_email && `Email: ${settings.company_email}`}<br/>
                    {settings.company_phone && `Phone: ${settings.company_phone}`}
                  </div>
                </div>
                <div>
                  <div className="bill-title">Billed To</div>
                  <div className="bill-name">{selectedCustDetails?.Name || 'Client Business Name'}</div>
                  <div className="bill-address">
                    {selectedCustDetails?.Address || 'Client Billing Address'}<br/>
                    {selectedCustDetails?.Email && `Email: ${selectedCustDetails.Email}`}<br/>
                    {selectedCustDetails?.Phone && `Phone: ${selectedCustDetails.Phone}`}
                  </div>
                </div>
              </div>

              {/* Items list */}
              <table className="paper-table">
                <thead>
                  <tr>
                    <th style={{ width: '50%' }}>Item Description</th>
                    <th style={{ width: '15%' }}>Qty</th>
                    <th style={{ width: '15%' }}>Cost</th>
                    <th style={{ width: '20%', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 500, color: 'var(--text-dark)' }}>{item.Description || 'Untitled Item'}</td>
                      <td>{item.QTY} {item.Unit || 'page'}</td>
                      <td>{formatCurrency(item.Cost)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(Number(item.QTY || 0) * Number(item.Cost || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="paper-summary-section">
                <div className="bank-details-box">
                  <div className="bank-details-title">Bank Details</div>
                  <div className="bank-row">
                    <span>Bank Name:</span>
                    <span>{settings.bank_name || 'N/A'}</span>
                  </div>
                  <div className="bank-row">
                    <span>Account Name:</span>
                    <span>{settings.bank_account_name || 'N/A'}</span>
                  </div>
                  <div className="bank-row">
                    <span>Account Number:</span>
                    <span>{settings.bank_account_number || 'N/A'}</span>
                  </div>
                </div>

                <div>
                  <table className="summary-totals-table">
                    <tbody>
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>Subtotal:</td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(finances.subtotal)}</td>
                      </tr>
                      {invoice.Discount > 0 && (
                        <tr>
                          <td style={{ color: 'var(--text-muted)' }}>Discount:</td>
                          <td style={{ textAlign: 'right', color: '#b91c1c' }}>-{formatCurrency(invoice.Discount)}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ color: 'var(--text-muted)' }}>Tax ({(invoice.TaxRate * 100).toFixed(0)}%):</td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(finances.taxAmount)}</td>
                      </tr>
                      <tr className="total-row">
                        <td>Total Amount:</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(finances.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {invoice.Notes && (
                <div className="paper-notes">
                  <div className="paper-notes-title">Notes</div>
                  <div className="paper-notes-val">{invoice.Notes}</div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 3. Customers Directory View
function CustomersView({ customers, headers, refreshData, showNotification }) {
  const [newCust, setNewCust] = useState({ Name: '', Email: '', Phone: '', Address: '', Website: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newCust.Name || !newCust.Email) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newCust)
      });
      if (res.ok) {
        showNotification('success', `Customer ${newCust.Name} saved successfully.`);
        setNewCust({ Name: '', Email: '', Phone: '', Address: '', Website: '' });
        setShowForm(false);
        refreshData();
      } else {
        throw new Error('Failed to create customer');
      }
    } catch (e) {
      showNotification('error', e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.75rem' }}>Customer Registry</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>View client contacts and direct addresses</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Hide Form' : 'Add Customer'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="creator-panel-left" style={{ marginBottom: '24px', maxWidth: '600px' }}>
          <h3 className="form-section-title" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>New Customer details</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Name <span className="required">*</span></label>
              <input 
                type="text" 
                className="input-control" 
                value={newCust.Name}
                onChange={e => setNewCust(prev => ({ ...prev, Name: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Email <span className="required">*</span></label>
              <input 
                type="email" 
                className="input-control" 
                value={newCust.Email}
                onChange={e => setNewCust(prev => ({ ...prev, Email: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input 
                type="text" 
                className="input-control" 
                value={newCust.Phone}
                onChange={e => setNewCust(prev => ({ ...prev, Phone: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Website</label>
              <input 
                type="text" 
                className="input-control" 
                value={newCust.Website}
                onChange={e => setNewCust(prev => ({ ...prev, Website: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Billing Address</label>
            <textarea 
              className="input-control" 
              rows="2"
              value={newCust.Address}
              onChange={e => setNewCust(prev => ({ ...prev, Address: e.target.value }))}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={isSubmitting}>
            Save Customer
          </button>
        </form>
      )}

      <div className="table-container">
        <table className="table-invoices">
          <thead>
            <tr>
              <th>Client Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Billing Address</th>
              <th>Website</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.CustomerID}>
                <td style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{c.Name}</td>
                <td>{c.Email}</td>
                <td>{c.Phone || '—'}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '300px' }}>{c.Address || '—'}</td>
                <td>{c.Website ? <a href={c.Website} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{c.Website}</a> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 4. Services View
function ServicesView({ services, headers, refreshData, showNotification }) {
  const [newSrv, setNewSrv] = useState({ Description: '', Unit: 'page', DefaultCost: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newSrv.Description || newSrv.DefaultCost <= 0) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/services`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newSrv)
      });
      if (res.ok) {
        showNotification('success', `Service "${newSrv.Description}" saved successfully.`);
        setNewSrv({ Description: '', Unit: 'page', DefaultCost: 0 });
        setShowForm(false);
        refreshData();
      } else {
        throw new Error('Failed to create service item');
      }
    } catch (e) {
      showNotification('error', e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.75rem' }}>Services Catalog</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Manage your product listings and base unit pricing</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Hide Form' : 'Add Item'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="creator-panel-left" style={{ marginBottom: '24px', maxWidth: '500px' }}>
          <h3 className="form-section-title" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>New Catalog item</h3>
          <div className="form-group">
            <label>Item Description <span className="required">*</span></label>
            <input 
              type="text" 
              className="input-control" 
              placeholder="e.g. Graphic Redesign, Hosting Service"
              value={newSrv.Description}
              onChange={e => setNewSrv(prev => ({ ...prev, Description: e.target.value }))}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Billing Unit <span className="required">*</span></label>
              <select 
                className="input-control"
                value={newSrv.Unit}
                onChange={e => setNewSrv(prev => ({ ...prev, Unit: e.target.value }))}
              >
                <option value="page">page</option>
                <option value="hour">hour</option>
                <option value="month">month</option>
                <option value="project">project</option>
                <option value="item">item</option>
              </select>
            </div>
            <div className="form-group">
              <label>Default Cost <span className="required">*</span></label>
              <input 
                type="number" 
                className="input-control" 
                value={newSrv.DefaultCost}
                onChange={e => setNewSrv(prev => ({ ...prev, DefaultCost: parseFloat(e.target.value) || 0 }))}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={isSubmitting}>
            Save Catalog Item
          </button>
        </form>
      )}

      <div className="table-container" style={{ maxWidth: '720px' }}>
        <table className="table-invoices">
          <thead>
            <tr>
              <th>Service Item</th>
              <th>Unit</th>
              <th style={{ textAlign: 'right' }}>Default Cost</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.ServiceID}>
                <td style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{s.Description}</td>
                <td><span className="badge badge-draft">{s.Unit}</span></td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-dark)' }}>
                  {new Intl.NumberFormat().format(s.DefaultCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 5. Settings Customization View
function SettingsView({ settings, headers, refreshData, showNotification }) {
  const [formState, setFormState] = useState({ ...settings });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFormState({ ...settings });
  }, [settings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(formState)
      });
      const data = await safeJson(res);
      if (data.success) {
        showNotification('success', 'System branding settings saved to sheets database.');
        refreshData();
      } else {
        throw new Error(data.error || 'Save failed');
      }
    } catch (e) {
      showNotification('error', e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (key, val) => {
    setFormState(prev => ({
      ...prev,
      [key]: val
    }));
  };

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.75rem' }}>System Config</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Configure white-label styling, bank routing, and defaults</p>
      </div>

      <form onSubmit={handleSubmit} className="creator-panel-left">
        <div className="form-section">
          <h3 className="form-section-title">Brand Identity</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Company/Brand Name</label>
              <input 
                type="text" 
                className="input-control" 
                value={formState.company_name || ''}
                onChange={e => handleFieldChange('company_name', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Brand Logo URL</label>
              <input 
                type="text" 
                className="input-control" 
                placeholder="https://domain.com/logo.png"
                value={formState.company_logo || ''}
                onChange={e => handleFieldChange('company_logo', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Accent Color (Hex)</label>
              <input 
                type="color" 
                className="input-control" 
                style={{ padding: '4px', height: '42px', cursor: 'pointer' }}
                value={formState.color_primary || '#0f172a'}
                onChange={e => handleFieldChange('color_primary', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Brand Phone Number</label>
              <input 
                type="text" 
                className="input-control" 
                value={formState.company_phone || ''}
                onChange={e => handleFieldChange('company_phone', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Company Billing Email</label>
              <input 
                type="email" 
                className="input-control" 
                value={formState.company_email || ''}
                onChange={e => handleFieldChange('company_email', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Company Website</label>
              <input 
                type="text" 
                className="input-control" 
                value={formState.company_website || ''}
                onChange={e => handleFieldChange('company_website', e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Office Address</label>
            <textarea 
              className="input-control" 
              rows="2"
              value={formState.company_address || ''}
              onChange={e => handleFieldChange('company_address', e.target.value)}
            />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Payment Settlement Details</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Bank Name</label>
              <input 
                type="text" 
                className="input-control" 
                placeholder="e.g. Bank Central Asia"
                value={formState.bank_name || ''}
                onChange={e => handleFieldChange('bank_name', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Account Name</label>
              <input 
                type="text" 
                className="input-control" 
                value={formState.bank_account_name || ''}
                onChange={e => handleFieldChange('bank_account_name', e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Account / Card Number</label>
            <input 
              type="text" 
              className="input-control" 
              value={formState.bank_account_number || ''}
              onChange={e => handleFieldChange('bank_account_number', e.target.value)}
            />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">System Defaults</h3>
          <div className="form-row">
            <div className="form-group">
              <label>System Currency Code</label>
              <input 
                type="text" 
                className="input-control" 
                placeholder="e.g. USD, EUR, IDR"
                value={formState.default_currency || 'USD'}
                onChange={e => handleFieldChange('default_currency', e.target.value.toUpperCase())}
              />
            </div>
            <div className="form-group">
              <label>Default Tax Rate</label>
              <input 
                type="number" 
                step="0.01"
                className="input-control" 
                placeholder="e.g. 0.11"
                value={formState.default_tax_rate || 0.11}
                onChange={e => handleFieldChange('default_tax_rate', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={isSubmitting}>
          Save Branding settings
        </button>
      </form>
    </div>
  );
}
