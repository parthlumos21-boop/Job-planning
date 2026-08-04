import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './auth/Login';
import Layout from './layouts/Layout';
import Dashboard from './dashboard/Dashboard';
import JobList from './jobs/JobList';
import JobDetail from './jobs/JobDetail';
import NewJobForm from './jobs/NewJobForm';
import ChartPage from './reports/ChartPage';
import Reports from './reports/Reports';

import KevalDashboard from './dashboard/KevalDashboard';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function JobsRoute() {
  return <JobList title="All Jobs Master Data" />;
}

function ChartRoute() {
  const { user } = useAuth();
  const isKeval = user?.username?.toLowerCase() === 'keval v shah';
  return isKeval ? <ChartPage /> : <Navigate to="/" replace />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="jobs" element={<JobsRoute />} />
            <Route path="jobs/new" element={<NewJobForm />} />
            <Route path="jobs/edit/:id" element={<NewJobForm />} />
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="chart" element={<ChartRoute />} />
            <Route path="live-monitor" element={<KevalDashboard />} />
            <Route path="reports" element={<Reports />} />

          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
