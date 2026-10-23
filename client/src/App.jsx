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
import DepartmentMyTasksPage from './jobs/DepartmentMyTasksPage';
import IncomingJobsPage from './jobs/IncomingJobsPage';
import UserManagementPage from './users/UserManagementPage';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function AdminOnlyRoute({ children }) {
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const username = (user?.username || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'executive' || role === 'superadmin' || username === 'keval v shah' || username === 'keval' || username === 'kevalvshah';
  return isAdmin ? children : <Navigate to="/" replace />;
}

function KevalOnlyRoute({ children }) {
  const { user } = useAuth();
  const username = (user?.username || '').trim().toLowerCase();
  const isKeval = username === 'keval v shah' || username === 'keval' || username === 'kevalvshah';
  return isKeval ? children : <Navigate to="/" replace />;
}

function RootRedirect() {
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const username = (user?.username || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'executive' || role === 'superadmin' || username === 'keval v shah' || username === 'keval' || username === 'kevalvshah';
  return <Navigate to={isAdmin ? "/admin/dashboard" : "/dashboard"} replace />;
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
            <Route index element={<RootRedirect />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="admin/dashboard" element={<AdminOnlyRoute><Dashboard /></AdminOnlyRoute>} />
            <Route path="admin/users" element={<AdminOnlyRoute><UserManagementPage /></AdminOnlyRoute>} />
            <Route path="admin/late-jobs" element={<AdminOnlyRoute><AdminOversightDashboard /></AdminOnlyRoute>} />
            <Route path="incoming-jobs" element={<IncomingJobsPage />} />
            <Route path="search-jobs" element={<SearchJobsPage />} />
            <Route path="my-tasks" element={<DepartmentMyTasksPage />} />
            <Route path="my-jobs" element={<MyJobs />} />
            <Route path="jobs" element={<JobsRoute />} />
            <Route path="jobs/handover" element={<AdminOnlyRoute><PlanningHandoverInbox /></AdminOnlyRoute>} />
            <Route path="jobs/handover/planning" element={<AdminOnlyRoute><PlanningHandoverInbox /></AdminOnlyRoute>} />
            <Route path="jobs/new" element={<NewJobForm />} />
            <Route path="jobs/edit/:id" element={<NewJobForm />} />
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="chart" element={<AdminOnlyRoute><ChartPage /></AdminOnlyRoute>} />
            <Route path="live-activity" element={<KevalOnlyRoute><LiveActivityDashboard /></KevalOnlyRoute>} />
            <Route path="live-monitor" element={<AdminOnlyRoute><KevalDashboard /></AdminOnlyRoute>} />
            <Route path="reports" element={<AdminOnlyRoute><Reports /></AdminOnlyRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
