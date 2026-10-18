import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireAuth, RequireManager } from './components/guards';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { DelegatesPage } from './pages/delegates/DelegatesPage';
import { DelegateDetailPage } from './pages/delegates/DelegateDetailPage';
import { DelegateTripPilgrimsPage } from './pages/delegates/DelegateTripPilgrimsPage';
import { TripsPage } from './pages/trips/TripsPage';
import { TripDetailPage } from './pages/trips/TripDetailPage';
import { PilgrimsPage } from './pages/pilgrims/PilgrimsPage';
import { PilgrimFormPage } from './pages/pilgrims/PilgrimFormPage';
import { PilgrimDetailPage } from './pages/pilgrims/PilgrimDetailPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { PaymentCreatePage } from './pages/payments/PaymentCreatePage';
import { MovementsPage } from './pages/finance/MovementsPage';
import { AccountsPage } from './pages/finance/AccountsPage';
import { DelegateAccountPage } from './pages/finance/DelegateAccountPage';
import { AdjustmentsPage } from './pages/finance/AdjustmentsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { UsersPage } from './pages/users/UsersPage';
import { AuditPage } from './pages/audit/AuditPage';
import { ProfilePage } from './pages/ProfilePage';
import { EmptyState } from './ui/primitives';

const NotFoundPage = () => (
  <div className="page">
    <EmptyState title="الصفحة غير موجودة" description="تحقق من الرابط أو عد إلى الرئيسية" />
  </div>
);

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/delegates" element={<DelegatesPage />} />
        {/* Operational drill-down: المناديب → المندوب → الرحلة → معتمرو المندوب */}
        <Route path="/delegates/:delegateId" element={<DelegateDetailPage />} />
        <Route path="/delegates/:delegateId/trips/:tripId/pilgrims" element={<DelegateTripPilgrimsPage />} />
        <Route path="/delegates/:delegateId/trips/:tripId/pilgrims/new" element={<PilgrimFormPage />} />
        <Route path="/delegates/:delegateId/trips/:tripId/pilgrims/:id" element={<PilgrimDetailPage />} />
        <Route path="/delegates/:delegateId/trips/:tripId/pilgrims/:id/edit" element={<PilgrimFormPage />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/pilgrims" element={<PilgrimsPage />} />
        <Route path="/pilgrims/new" element={<PilgrimFormPage />} />
        <Route path="/pilgrims/:id" element={<PilgrimDetailPage />} />
        <Route path="/pilgrims/:id/edit" element={<PilgrimFormPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/payments/new" element={<PaymentCreatePage />} />
        <Route
          path="/finance/movements"
          element={
            <RequireManager>
              <MovementsPage />
            </RequireManager>
          }
        />
        <Route path="/finance/ledger" element={<Navigate to="/finance/movements" replace />} />
        {/* Finance: حسابات المناديب */}
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/:delegateId" element={<DelegateAccountPage />} />
        <Route path="/accounts/:delegateId/payments/new" element={<PaymentCreatePage />} />
        <Route path="/finance/statements" element={<Navigate to="/accounts" replace />} />
        <Route
          path="/finance/adjustments"
          element={
            <RequireManager>
              <AdjustmentsPage />
            </RequireManager>
          }
        />
        <Route path="/reports" element={<ReportsPage />} />
        <Route
          path="/users"
          element={
            <RequireManager>
              <UsersPage />
            </RequireManager>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireManager>
              <AuditPage />
            </RequireManager>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  </BrowserRouter>
);
