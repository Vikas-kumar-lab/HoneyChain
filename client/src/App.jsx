import React, { useEffect } from 'react';
import { BrowserRouter as Router, Switch, Route, Redirect } from 'react-router-dom';
import './App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { wakeUpBackend } from './aiService';
import Header from './components/Header';
import Overview from './pages/Overview';
import AIDashboard from './pages/AIDashboard';
import HiveDashboard from './pages/HiveDashboard';
import BeekeeperPortal from './pages/BeekeeperPortal';
import LabTesting from './pages/LabTesting';
import SupplyPipeline from './pages/SupplyPipeline';
import ConsumerVerify from './pages/ConsumerVerify';
import AssignRoles from './pages/AssignRoles';
import RetailPOS from './pages/RetailPOS';

import Login from './pages/Login';
import ErrorBoundary from './components/common/ErrorBoundary';
import AIChatbotModal from './components/common/AIChatbotModal';
import PWAInstallPrompt from './components/common/PWAInstallPrompt';

function RoleProtectedRoute({ component: Component, allowedRoles, ...rest }) {
  const { isAuthenticated, roleInfo, currentUser } = useAuth();
  const userRoles = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
  const hasAccess = allowedRoles && allowedRoles.some(r => userRoles.includes(r));

  return (
    <Route
      {...rest}
      render={(props) => {
        if (!isAuthenticated) {
          return <Redirect to="/login" />;
        }
        if (!hasAccess) {
          return <Redirect to={currentUser?.portalPath || '/'} />;
        }
        return <Component {...props} />;
      }}
    />
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  // Warm up Render backend immediately on page load and keep it alive every 4 minutes
  useEffect(() => {
    wakeUpBackend();
    const interval = setInterval(() => {
      wakeUpBackend();
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Hide top header whenever user is not logged in (pure centered card experience for login, apply & QR verify)
  const hideHeader = !isAuthenticated;

  return (
    <div className="App">
      {!hideHeader && <Header />}
      <main className="app-main-content">
        <ErrorBoundary>
          <Switch>
            {/* Public Login, Apply & QR Verify Routes */}
            <Route path="/login" exact>
              {isAuthenticated ? <Redirect to="/" /> : <Login initialTab="login" />}
            </Route>
            <Route path="/apply" exact>
              {isAuthenticated ? <Redirect to="/" /> : <Login initialTab="apply" />}
            </Route>

            {/* Public QR Verification Routes */}
            <Route path="/consumer-verify" exact component={ConsumerVerify} />
            <Route path="/verify/:batchId" exact component={ConsumerVerify} />
            <Route path="/verify" exact component={ConsumerVerify} />

            {/* If NOT authenticated: redirect to /login */}
            {!isAuthenticated ? (
              <Redirect to="/login" />
            ) : (
              /* Role-Protected Enterprise Portals */
              <Switch>
                <Route path="/" exact component={Overview} />
                
                {/* AI Intelligence Command Center */}
                <RoleProtectedRoute path="/ai-dashboard" component={AIDashboard} allowedRoles={['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER']} />
                <RoleProtectedRoute path="/ai" component={AIDashboard} allowedRoles={['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER']} />

                {/* Admin Portal */}
                <RoleProtectedRoute path="/admin" component={AssignRoles} allowedRoles={['ADMIN']} />
                <RoleProtectedRoute path="/roles" component={AssignRoles} allowedRoles={['ADMIN']} />

                {/* Beekeeper Portals */}
                <RoleProtectedRoute path="/hives" component={HiveDashboard} allowedRoles={['ADMIN', 'BEEKEEPER']} />
                <RoleProtectedRoute path="/beekeeper" component={BeekeeperPortal} allowedRoles={['ADMIN', 'BEEKEEPER']} />

                {/* Lab Testing Portal */}
                <RoleProtectedRoute path="/lab-testing" component={LabTesting} allowedRoles={['ADMIN', 'LAB']} />

                {/* Custody Pipeline: Accessible to all operational roles */}
                <RoleProtectedRoute path="/supply-pipeline" component={SupplyPipeline} allowedRoles={['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER']} />

                {/* Retail Outlet POS */}
                <RoleProtectedRoute path="/retail" component={RetailPOS} allowedRoles={['ADMIN', 'RETAILER']} />
                <RoleProtectedRoute path="/pos" component={RetailPOS} allowedRoles={['ADMIN', 'RETAILER']} />

                {/* QR Verify Portal */}
                <RoleProtectedRoute path="/consumer-verify" component={ConsumerVerify} allowedRoles={['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER']} />

                <Redirect to="/" />
              </Switch>
            )}
          </Switch>
        </ErrorBoundary>
      </main>
      <AIChatbotModal />
      <PWAInstallPrompt />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
