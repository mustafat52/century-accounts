import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import InvoiceModal from './components/InvoiceModal';
import QuotationModal from './components/QuotationModal';
import PrintableDocument from './components/PrintableDocument';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Invoicing from './pages/Invoicing';
import Customers from './pages/Customers';
import Vendors from './pages/Vendors';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Links from './pages/Links';

function ProtectedShell() {
  const { isAuthenticated, authLoading, dataLoading } = useApp();

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app">
      <Sidebar />
      <MobileNav />
      <main className="main">
        {dataLoading ? (
          <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading business data…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/invoicing" element={<Invoicing />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/links" element={<Links />} />
          </Routes>
        )}
      </main>
      <InvoiceModal />
      <QuotationModal />
      <PrintableDocument />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
    </AppProvider>
  );
}