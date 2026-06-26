import { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Users, 
  Plus, 
  Trash2, 
  Send, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Printer, 
  ArrowLeft, 
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
  // User authentication state
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem('valora_auth');
    return saved ? JSON.parse(saved) : null;
  });

  const userRole = (auth?.role || '').toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'super admin' || userRole === 'supreme admin';
  const isSuperAdmin = userRole === 'super admin' || userRole === 'supreme admin';

  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
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
    if (!auth) return {};
    return {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json'
    };
  };

  // Fetch core data from Google Sheet
  const fetchAllData = async () => {
    if (!auth) return;
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
    if (auth) {
      fetchAllData();
    }
  }, [auth]);

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

  // Handle Login submission
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setWizardError('');
    setWizardSuccess('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      const data = await safeJson(res);
      if (data.success) {
        const authData = { username: data.username, role: data.role, token: data.token };
        localStorage.setItem('valora_auth', JSON.stringify(authData));
        setWizardSuccess('Login successful!');
        setTimeout(() => {
          setAuth(authData);
          setWizardSuccess('');
        }, 800);
      } else {
        throw new Error(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setWizardError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      localStorage.removeItem('valora_auth');
      setAuth(null);
      setInvoices([]);
      setCustomers([]);
      setServices([]);
      setSettings({});
      setCurrentTab('dashboard');
    }
  };

  if (!auth) {
    return (
      <div className="login-container-box">
        <div className="login-card">
          <div className="login-logo-container">
            <img src="/logo.svg" alt="Valora Logo" className="login-logo" />
            <div className="login-brand-name">VALORA</div>
            <div className="login-brand-tagline">INTEGRATION SOLUTIONS LIMITED</div>
          </div>
          
          <h2 className="login-title">Billing Portal</h2>
          <p className="login-desc">Enter your administrative or staff credentials to sign in.</p>

          {wizardError && <div className="wizard-status error"><AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{wizardError}</div>}
          {wizardSuccess && <div className="wizard-status success"><Check size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{wizardSuccess}</div>}

          <form onSubmit={handleLoginSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input 
                type="text" 
                id="username" 
                className="input-control" 
                placeholder="e.g. admin or staff"
                value={loginData.username}
                onChange={e => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input 
                type="password" 
                id="password" 
                className="input-control" 
                placeholder="••••••••"
                value={loginData.password}
                onChange={e => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                required
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary login-btn"
              disabled={isLoading}
            >
              {isLoading ? <RefreshCw className="animate-spin" size={18} /> : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="navbar">
        <div className="logo-container">
          <img src="/logo.svg" alt="Valora Logo" className="navbar-logo" />
          <div>
            <div className="navbar-brand-title">VALORA</div>
            <div className="navbar-brand-subtitle">Billing Portal • {auth.role}</div>
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
          {isAdmin && (
            <div 
              className={`nav-link ${currentTab === 'settings' ? 'active' : ''}`}
              onClick={() => setCurrentTab('settings')}
            >
              Settings
            </div>
          )}
          {isSuperAdmin && (
            <div 
              className={`nav-link ${currentTab === 'manage-users' ? 'active' : ''}`}
              onClick={() => setCurrentTab('manage-users')}
            >
              Manage Users
            </div>
          )}
        </nav>

        <div className="nav-actions">
          <button className="btn btn-secondary btn-sync" onClick={fetchAllData} disabled={isLoading} title="Sync database">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Sync
          </button>
          <button className="btn btn-danger btn-logout" onClick={handleLogout} title="Sign Out">
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
        {currentTab === 'manage-users' && isSuperAdmin && (
          <ManageUsersView 
            headers={getHeaders()}
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

  const formatCurrency = (val) => {
    const cur = settings.default_currency || 'NGN';
    const locale = cur === 'NGN' ? 'en-NG' : undefined;
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val);
  };

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
                <th>Created By</th>
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
                  <td>
                    <span className="badge badge-staff">
                      {invoice.CreatedBy || 'admin'}
                    </span>
                  </td>
                  <td>{invoice.IssueDate}</td>
                  <td style={{ color: new Date(invoice.DueDate) < new Date() && invoice.Status !== 'Paid' ? '#ef4444' : 'inherit' }}>
                    {invoice.DueDate}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-dark)' }}>
                    {formatCurrency(invoice.Total)}
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

  const [customerSearch, setCustomerSearch] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.toLowerCase().trim();
    if (!term) return customers;
    return customers.filter(c => 
      (c.Name || '').toLowerCase().includes(term) || 
      (c.CustomerID || '').toLowerCase().includes(term)
    );
  }, [customers, customerSearch]);

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

  const parseDateParts = (dateString) => {
    if (!dateString) return { day: 'DD', month: 'MM', year: 'YYYY' };
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
          return { day: parts[2], month: parts[1], year: parts[0] };
        }
        return { day: 'DD', month: 'MM', year: 'YYYY' };
      }
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return {
        day: String(d.getDate()).padStart(2, '0'),
        month: months[d.getMonth()],
        year: String(d.getFullYear())
      };
    } catch (e) {
      return { day: 'DD', month: 'MM', year: 'YYYY' };
    }
  };

  const formatCurrency = (val) => {
    const cur = settings.default_currency || 'NGN';
    const locale = cur === 'NGN' ? 'en-NG' : undefined;
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val);
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
            <div className="form-group" style={{ position: 'relative' }}>
              <label>Select Customer <span className="required">*</span></label>
              {invoice.CustomerID ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    flexGrow: 1,
                    padding: '10px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: '#f8fafc',
                    fontWeight: 600,
                    color: 'var(--text-dark)'
                  }}>
                    {selectedCustDetails?.Name || invoice.CustomerID}
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => {
                      setInvoice(prev => ({ ...prev, CustomerID: '' }));
                      setCustomerSearch('');
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input 
                    type="text" 
                    className="input-control" 
                    placeholder="Search by customer name or ID..." 
                    value={customerSearch}
                    onChange={e => {
                      setCustomerSearch(e.target.value);
                      setShowSearchDropdown(true);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                    onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
                  />
                  {showSearchDropdown && (
                    <div className="search-dropdown-list">
                      {filteredCustomers.length === 0 ? (
                        <div className="search-dropdown-no-results">No clients found</div>
                      ) : (
                        filteredCustomers.map(c => (
                          <div 
                            key={c.CustomerID} 
                            className="search-dropdown-item" 
                            onMouseDown={() => {
                              setInvoice(prev => ({ ...prev, CustomerID: c.CustomerID }));
                              setShowSearchDropdown(false);
                            }}
                          >
                            <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{c.Name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {c.CustomerID} • {c.Email}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
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
              {/* Header section */}
              <div className="valora-header">
                <div className="valora-header-left">
                  <img src="/logo.svg" alt="Valora Logo" className="valora-paper-logo" />
                  <div className="valora-brand-title">VALORA</div>
                  <div className="valora-brand-subtitle">INTEGRATION SOLUTIONS LIMITED</div>
                  
                  <div className="valora-invoice-title-block">
                    <h1 className="valora-invoice-title">INVOICE</h1>
                    <div className="valora-invoice-num-pill">
                      INVOICE NO. <span>{invoice.InvoiceID || 'INV-2025-XXXX'}</span>
                    </div>
                  </div>
                </div>

                <div className="valora-header-right">
                  <div className="valora-contact-block">
                    <div className="valora-contact-item">
                      <span className="valora-contact-icon">📞</span>
                      <span>+234 806 346 9170</span>
                    </div>
                    <div className="valora-contact-item">
                      <span className="valora-contact-icon">📍</span>
                      <span className="valora-contact-address">
                        No 3 Worji Close, Magrove Lane,<br />
                        Woju Road, Port Harcourt,<br />
                        Rivers State, Nigeria.
                      </span>
                    </div>
                    <div className="valora-contact-item">
                      <span className="valora-contact-icon">✉️</span>
                      <span>info@valora.com.ng</span>
                    </div>
                    <div className="valora-contact-item">
                      <span className="valora-contact-icon">🌐</span>
                      <span>www.valora.com.ng</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bill To & Date section */}
              <div className="valora-bill-date-section">
                <div className="valora-bill-to-box">
                  <div className="valora-bill-to-tab">BILL TO</div>
                  <div className="valora-bill-to-content">
                    <div className="valora-bill-row">
                      <span className="valora-bill-icon">👤</span>
                      <span className="valora-bill-label">Name:</span>
                      <span className="valora-bill-value">{selectedCustDetails?.Name || '______________________________________'}</span>
                    </div>
                    <div className="valora-bill-row">
                      <span className="valora-bill-icon">🏢</span>
                      <span className="valora-bill-label">Address:</span>
                      <span className="valora-bill-value valora-bill-address">{selectedCustDetails?.Address || '______________________________________'}</span>
                    </div>
                  </div>
                </div>

                <div className="valora-date-box">
                  <div className="valora-date-header">
                    <span className="valora-date-icon">📅</span>
                    <span className="valora-date-title">INVOICE DATE</span>
                  </div>
                  <div className="valora-date-grid">
                    <div className="valora-date-part">
                      <div className="valora-date-val">{parseDateParts(invoice.IssueDate).day}</div>
                      <div className="valora-date-lbl">DAY</div>
                    </div>
                    <div className="valora-date-part">
                      <div className="valora-date-val">{parseDateParts(invoice.IssueDate).month}</div>
                      <div className="valora-date-lbl">MONTH</div>
                    </div>
                    <div className="valora-date-part">
                      <div className="valora-date-val">{parseDateParts(invoice.IssueDate).year}</div>
                      <div className="valora-date-lbl">YEAR</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table section */}
              <div className="valora-table-container">
                <table className="valora-table">
                  <thead>
                    <tr>
                      <th style={{ width: '8%' }}>#</th>
                      <th style={{ width: '52%', textAlign: 'left' }}>DESCRIPTION</th>
                      <th style={{ width: '10%' }}>QTY</th>
                      <th style={{ width: '15%' }}>UNIT PRICE</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Render active items */}
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td style={{ textAlign: 'left', fontWeight: 500 }}>{item.Description || 'Untitled Item'}</td>
                        <td>{item.QTY}</td>
                        <td>{formatCurrency(item.Cost)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(Number(item.QTY || 0) * Number(item.Cost || 0))}</td>
                      </tr>
                    ))}
                    {/* Pad up to 12 rows */}
                    {items.length < 12 && Array.from({ length: 12 - items.length }).map((_, idx) => {
                      const rowNum = items.length + idx + 1;
                      return (
                        <tr key={`empty-${idx}`} className="valora-empty-row">
                          <td>{rowNum}</td>
                          <td></td>
                          <td></td>
                          <td></td>
                          <td style={{ textAlign: 'right' }}></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary and Payment section */}
              <div className="valora-summary-payment-grid">
                {/* Left side: Payment Info & Terms */}
                <div className="valora-payment-terms-side">
                  <div className="valora-payment-box">
                    <div className="valora-payment-title">PAYMENT INFORMATION</div>
                    <div className="valora-payment-row">
                      <span className="valora-payment-icon">🏛️</span>
                      <span className="valora-payment-label">Bank Name:</span>
                      <span className="valora-payment-value">{settings.bank_name || '__________________________'}</span>
                    </div>
                    <div className="valora-payment-row">
                      <span className="valora-payment-icon">💳</span>
                      <span className="valora-payment-label">Account Name:</span>
                      <span className="valora-payment-value">{settings.bank_account_name || '__________________________'}</span>
                    </div>
                    <div className="valora-payment-row">
                      <span className="valora-payment-icon">📋</span>
                      <span className="valora-payment-label">Account Number:</span>
                      <span className="valora-payment-value">{settings.bank_account_number || '__________________________'}</span>
                    </div>
                  </div>

                  <div className="valora-terms-box">
                    <div className="valora-section-title">
                      <span className="valora-title-icon">📋</span> TERMS & CONDITIONS
                    </div>
                    <ul className="valora-terms-list">
                      <li>Payment is due within 7 days from the invoice date.</li>
                      <li>Please make payment to the account details provided.</li>
                      <li>Thank you for your business!</li>
                    </ul>
                  </div>
                </div>

                {/* Right side: Summary & Totals */}
                <div className="valora-totals-side">
                  <div className="valora-summary-box">
                    <div className="valora-summary-title">SUMMARY</div>
                    <div className="valora-summary-row">
                      <span>SUBTOTAL</span>
                      <span>{formatCurrency(finances.subtotal)}</span>
                    </div>
                    {invoice.Discount > 0 && (
                      <div className="valora-summary-row discount">
                        <span>DISCOUNT</span>
                        <span>-{formatCurrency(invoice.Discount)}</span>
                      </div>
                    )}
                    <div className="valora-summary-row">
                      <span>TAX ({(invoice.TaxRate * 100).toFixed(0)}%)</span>
                      <span>{formatCurrency(finances.taxAmount)}</span>
                    </div>

                    <div className="valora-total-pill">
                      <div className="valora-total-lbl">TOTAL</div>
                      <div className="valora-total-val">{formatCurrency(finances.total)}</div>
                    </div>
                  </div>

                  <div className="valora-thankyou-box">
                    <div className="valora-thankyou-title">
                      <span className="valora-title-icon">🤝</span> THANK YOU
                    </div>
                    <p className="valora-thankyou-text">
                      We appreciate your trust in Valora Integration Solutions Limited.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom footer signature block & banner */}
              <div className="valora-footer-signature-row">
                <div className="valora-signature-block">
                  <div className="valora-signature-title">
                    <span className="valora-title-icon">✍️</span> CUSTOMER SIGNATURE
                  </div>
                  <div className="valora-signature-line"></div>
                </div>
              </div>

              {/* Bottom banner strip */}
              <div className="valora-bottom-banner">
                <div className="valora-banner-left">
                  Integrating Solutions, Delivering Value.
                </div>
                <div className="valora-banner-right">
                  <div className="valora-banner-drop">💧</div>
                </div>
              </div>
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
            {services.map((s) => {
              const formatCurrency = (val) => {
                const cur = settings.default_currency || 'NGN';
                const locale = cur === 'NGN' ? 'en-NG' : undefined;
                return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val);
              };
              return (
                <tr key={s.ServiceID}>
                  <td style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{s.Description}</td>
                  <td><span className="badge badge-draft">{s.Unit}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-dark)' }}>
                    {formatCurrency(s.DefaultCost)}
                  </td>
                </tr>
              );
            })}
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

// 6. Manage Users View (Super Admin only)
function ManageUsersView({ headers, showNotification }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newUser, setNewUser] = useState({
    Username: '',
    Password: '',
    Name: '',
    Email: '',
    Role: 'Staff'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users`, { headers });
      const data = await safeJson(res);
      if (res.ok) {
        setUsers(data);
      } else {
        throw new Error(data.error || 'Failed to fetch users');
      }
    } catch (e) {
      showNotification('error', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newUser.Username || !newUser.Password || !newUser.Name || !newUser.Email) {
      alert('Please fill out all fields.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newUser)
      });
      const data = await safeJson(res);
      if (res.ok) {
        showNotification('success', `User ${newUser.Username} created successfully.`);
        setNewUser({
          Username: '',
          Password: '',
          Name: '',
          Email: '',
          Role: 'Staff'
        });
        fetchUsers();
      } else {
        throw new Error(data.error || 'Failed to create user.');
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
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.75rem' }}>User Management</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Create and manage accounts for Admin and Staff users</p>
        </div>
      </div>

      <div className="creator-container">
        {/* Left Side: Create User Form */}
        <div className="creator-panel-left" style={{ flex: '1 1 350px' }}>
          <form onSubmit={handleSubmit} className="form-section">
            <h3 className="form-section-title">Add New User</h3>
            
            <div className="form-group">
              <label>Full Name <span className="required">*</span></label>
              <input 
                type="text" 
                className="input-control" 
                placeholder="e.g. John Doe"
                value={newUser.Name}
                onChange={e => setNewUser(prev => ({ ...prev, Name: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label>Email Address <span className="required">*</span></label>
              <input 
                type="email" 
                className="input-control" 
                placeholder="e.g. john@valora.com"
                value={newUser.Email}
                onChange={e => setNewUser(prev => ({ ...prev, Email: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label>Username <span className="required">*</span></label>
              <input 
                type="text" 
                className="input-control" 
                placeholder="e.g. johndoe"
                value={newUser.Username}
                onChange={e => setNewUser(prev => ({ ...prev, Username: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label>Password <span className="required">*</span></label>
              <input 
                type="password" 
                className="input-control" 
                placeholder="••••••••"
                value={newUser.Password}
                onChange={e => setNewUser(prev => ({ ...prev, Password: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label>Access Role <span className="required">*</span></label>
              <select 
                className="input-control"
                value={newUser.Role}
                onChange={e => setNewUser(prev => ({ ...prev, Role: e.target.value }))}
                required
              >
                <option value="Staff">Staff</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '8px', width: '100%' }} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>

        {/* Right Side: Users List Table */}
        <div className="creator-panel-right" style={{ flex: '2 1 500px' }}>
          <div className="table-container" style={{ margin: 0 }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <RefreshCw className="animate-spin" size={32} style={{ marginBottom: '12px' }} />
                <p>Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Users size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p>No users found in database.</p>
              </div>
            ) : (
              <table className="table-invoices">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.Username}>
                      <td style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{u.Name}</td>
                      <td>{u.Username}</td>
                      <td>{u.Email}</td>
                      <td>
                        <span className={`badge badge-${u.Role === 'Super Admin' ? 'paid' : u.Role === 'Admin' ? 'sent' : 'draft'}`}>
                          {u.Role}
                        </span>
                      </td>
                      <td>{u.DateCreated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
