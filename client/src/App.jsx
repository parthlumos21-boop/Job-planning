import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './auth/Login';
import Layout from './layouts/Layout';
import Dashboard from './dashboard/Dashboard';
import JobList from './jobs/JobList';
import JobDetail from './jobs/JobDetail';
import NewJobForm from './jobs/NewJobForm';
import MyJobs from './jobs/MyJobs';
import PlanningHandoverInbox from './jobs/PlanningHandoverInbox';
import ChartPage from './reports/ChartPage';
import Reports from './reports/Reports';

import KevalDashboard from './dashboard/KevalDashboard';
import AdminOversightDashboard from './dashboard/AdminOversightDashboard';
import LiveActivityDashboard from './dashboard/LiveActivityDashboard';
import SearchJobsPage from './jobs/SearchJobsPage';
import MarketingMyTasksPage from './jobs/marketing/MarketingMyTasksPage';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function AdminOnlyRoute({ children }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase() === 'keval v shah';
  return isAdmin ? children : <Navigate to="/" replace />;
}

function JobsRoute() {
  return <JobList title="All Jobs Master Data" />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="search-jobs" element={<SearchJobsPage />} />
            <Route path="my-tasks" element={<MarketingMyTasksPage />} />
            <Route path="my-jobs" element={<MyJobs />} />
            <Route path="jobs" element={<JobsRoute />} />
            <Route path="jobs/handover" element={<AdminOnlyRoute><PlanningHandoverInbox /></AdminOnlyRoute>} />
            <Route path="jobs/handover/planning" element={<AdminOnlyRoute><PlanningHandoverInbox /></AdminOnlyRoute>} />
            <Route path="jobs/new" element={<NewJobForm />} />
            <Route path="jobs/edit/:id" element={<NewJobForm />} />
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="chart" element={<AdminOnlyRoute><ChartPage /></AdminOnlyRoute>} />
            <Route path="live-activity" element={<AdminOnlyRoute><LiveActivityDashboard /></AdminOnlyRoute>} />
            <Route path="live-monitor" element={<AdminOnlyRoute><KevalDashboard /></AdminOnlyRoute>} />
            <Route path="admin/dashboard" element={<AdminOnlyRoute><AdminOversightDashboard /></AdminOnlyRoute>} />
            <Route path="reports" element={<AdminOnlyRoute><Reports /></AdminOnlyRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
