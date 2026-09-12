import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { InventoryProvider } from './context/InventoryContext';
import { useArrowFieldNavigation } from './hooks/useArrowFieldNavigation';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import InventorySidebar from './components/InventorySidebar';
import QuotationModal from './components/QuotationModal';
import PrintableDocument from './components/PrintableDocument';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Invoicing from './pages/Invoicing';
import PriceList from './pages/PriceList';
import Customers from './pages/Customers';
import Vendors from './pages/Vendors';
import PurchaseBills from './pages/PurchaseBills';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Links from './pages/Links';
import CategoriesStock from './pages/inventory/CategoriesStock';
import WasteLedger from './pages/inventory/WasteLedger';
import CuttingPlan from './pages/inventory/CuttingPlan';

function ProtectedShell() {
  const { isAuthenticated, authLoading, dataLoading, hasLoadedOnce } = useApp();

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
        {dataLoading && !hasLoadedOnce ? (
          <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading business data…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/invoicing" element={<Invoicing />} />
            <Route path="/price-list" element={<PriceList />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/purchase-bills" element={<PurchaseBills />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/links" element={<Links />} />
          </Routes>
        )}
      </main>
      <QuotationModal />
      <PrintableDocument />
    </div>
  );
}

// Separate shell from ProtectedShell (spec section 5: separate nav, pages,
// tables) but reuses the SAME auth state from AppContext — the toggle on
// the login screen only decides which shell renders after auth succeeds,
// it isn't a second login system. Data is scoped to its own
// InventoryProvider rather than AppContext's, per spec section 7.
function InventoryShell() {
  const { isAuthenticated, authLoading } = useApp();

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
    <InventoryProvider>
      <div className="app">
        <InventorySidebar />
        <main className="main">
          <Routes>
            <Route path="stock" element={<CategoriesStock />} />
            <Route path="waste" element={<WasteLedger />} />
            <Route path="cutting" element={<CuttingPlan />} />
            <Route index element={<Navigate to="stock" replace />} />
          </Routes>
        </main>
      </div>
    </InventoryProvider>
  );
}

export default function App() {
  // App-wide, mounted once — works on every field everywhere, including
  // the Login page, since it's above the auth gate.
  useArrowFieldNavigation();

  return (
    <AppProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/inventory/*" element={<InventoryShell />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
    </AppProvider>
  );
}