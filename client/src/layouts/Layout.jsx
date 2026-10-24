import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import TopHeader from '../components/TopHeader';
import {
  LayoutDashboard, PlusCircle,
  FileBarChart, User, LogOut, Activity, FileText,
  UserCheck, ArrowRightLeft, ShieldCheck, History, Search, CheckSquare,
  Inbox, Users
} from 'lucide-react';
import { isMarketingUser } from '../config/marketingFormConfig';

const DEPT_DISPLAY_NAMES = {
  marketing: 'Marketing',
  design: 'Design- Electrical',
  mechanical: 'Design- Mechanical',
  purchase: 'Procurement',
  production: 'Production & QC & Dispatch',
  dispatch: 'Production & QC & Dispatch',
  qc: 'Production & QC & Dispatch'
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingHandoverCount, setPendingHandoverCount] = useState(0);
  const [incomingJobsCount, setIncomingJobsCount] = useState(0);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('job_planning_sidebar_collapsed') === 'true';
  });

  const primaryDept = user?.departments?.[0] || 'admin';
  const deptName = user?.role === 'admin' || user?.role === 'executive'
    ? 'Administrator'
    : DEPT_DISPLAY_NAMES[primaryDept] || primaryDept;

  const userRole = (user?.role || '').toLowerCase();
  const userName = (user?.username || '').toLowerCase();
  const isKeval = userName === 'keval v shah' || userName === 'keval' || userName === 'kevalvshah';
  const isAdmin = userRole === 'admin' || userRole === 'executive' || userRole === 'superadmin' || isKeval;

  const [overdueJobCount, setOverdueJobCount] = useState(0);

  useEffect(() => {
    async function loadStats() {
      try {
        const [handoverRes, kpiRes, incomingRes] = await Promise.allSettled([
          api.get('/jobs/handovers/stats'),
          isAdmin ? api.get('/admin/dashboard/kpis') : Promise.resolve({ data: null }),
          api.get('/jobs/incoming/count')
        ]);
        if (handoverRes.status === 'fulfilled' && handoverRes.value.data?.pendingReview !== undefined) {
          setPendingHandoverCount(handoverRes.value.data.pendingReview);
        }
        if (kpiRes.status === 'fulfilled' && kpiRes.value?.data?.overdueJobs !== undefined) {
          setOverdueJobCount(kpiRes.value.data.overdueJobs);
        }
        if (incomingRes.status === 'fulfilled' && incomingRes.value?.data?.count !== undefined) {
          setIncomingJobsCount(incomingRes.value.data.count);
        }
      } catch (e) {
        // quiet error
      }
    }
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('job_planning_sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const dashboardPath = isAdmin ? '/admin/dashboard' : '/dashboard';

  const navItems = [
    { section: 'CORE' },
    { to: dashboardPath, label: 'Dashboard', icon: <LayoutDashboard size={18} strokeWidth={1.8} /> },
    { to: '/jobs/new', label: 'New Job', icon: <PlusCircle size={18} strokeWidth={1.8} /> },
    { to: '/search-jobs', label: 'Search Jobs', icon: <Search size={18} strokeWidth={1.8} /> },

    { section: 'MY WORKSPACE' },
    { to: '/incoming-jobs', label: 'Incoming Jobs', icon: <Inbox size={18} strokeWidth={1.8} />, badge: incomingJobsCount },
    { to: '/my-tasks', label: 'My Tasks', icon: <CheckSquare size={18} strokeWidth={1.8} /> },
    { to: '/my-jobs', label: 'My Jobs', icon: <UserCheck size={18} strokeWidth={1.8} /> },
  ];

  if (isAdmin) {
    navItems.push({ section: 'MANAGEMENT & AUDIT' });
    navItems.push({ to: '/admin/users', label: 'User Management', icon: <Users size={18} strokeWidth={1.8} /> });
    navItems.push({ to: '/jobs/handover', label: 'Planning Control Center', icon: <ArrowRightLeft size={18} strokeWidth={1.8} />, badge: pendingHandoverCount });
    navItems.push({ 
      to: '/admin/late-jobs', 
      label: 'Job Late for Users', 
      icon: <ShieldCheck size={18} strokeWidth={1.8} />
    });
    if (isKeval) {
      navItems.push({ to: '/live-activity', label: 'Live Activity', icon: <History size={18} strokeWidth={1.8} /> });
    }
    navItems.push({ to: '/live-monitor', label: 'Live Monitor & Analytics', icon: <Activity size={18} strokeWidth={1.8} /> });
    navItems.push({ to: '/reports', label: 'Reports', icon: <FileText size={18} strokeWidth={1.8} /> });
  }

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/';
    if (path === '/admin/dashboard') return location.pathname === '/admin/dashboard' || location.pathname === '/';
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path.split('?')[0]);
  };

  return (
    <div className="min-h-screen flex bg-[#FFFFFF]">
      <Sidebar
        user={user}
        deptName={deptName}
        navItems={navItems}
        isActive={isActive}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      
      <main className="relative flex-1 flex flex-col h-screen overflow-hidden bg-[#FFFFFF]">

        {/* Top Header */}
        <TopHeader
          pendingCount={pendingHandoverCount + incomingJobsCount}
          deptName={deptName}
        />

        {/* Page Content */}
        <div className="relative flex-1 p-6 md:p-8 overflow-auto z-10 bg-[#FFFFFF]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
