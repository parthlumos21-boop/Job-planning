import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import {
  LayoutDashboard, PlusCircle, Briefcase,
  FileBarChart, User, LogOut, Activity, FileText,
  UserCheck, ArrowRightLeft, ShieldCheck, History
} from 'lucide-react';

const DEPT_DISPLAY_NAMES = {
  marketing: 'Marketing',
  design: 'Design- Electrical',
  mechanical: 'Design- Mechanical',
  purchase: 'Procurement',
  production: 'Production  & QC & Dispatch',
  dispatch: 'Production  & QC & Dispatch',
  qc: 'Production  & QC & Dispatch'
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingHandoverCount, setPendingHandoverCount] = useState(0);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('job_planning_sidebar_collapsed') === 'true';
  });

  const primaryDept = user?.departments?.[0] || 'admin';
  const deptName = user?.role === 'admin' || user?.role === 'executive'
    ? 'Administrator'
    : DEPT_DISPLAY_NAMES[primaryDept] || primaryDept;

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase() === 'keval v shah';

  const [overdueJobCount, setOverdueJobCount] = useState(0);

  useEffect(() => {
    async function loadStats() {
      try {
        const [handoverRes, kpiRes] = await Promise.allSettled([
          api.get('/jobs/handovers/stats'),
          isAdmin ? api.get('/admin/dashboard/kpis') : Promise.resolve({ data: null })
        ]);
        if (handoverRes.status === 'fulfilled' && handoverRes.value.data?.pendingReview !== undefined) {
          setPendingHandoverCount(handoverRes.value.data.pendingReview);
        }
        if (kpiRes.status === 'fulfilled' && kpiRes.value?.data?.overdueJobs !== undefined) {
          setOverdueJobCount(kpiRes.value.data.overdueJobs);
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

  const navItems = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { to: '/jobs/new', label: 'New Job', icon: <PlusCircle size={20} /> },
    { to: '/my-jobs', label: 'My Jobs', icon: <UserCheck size={20} /> },
    { to: '/jobs/handover', label: 'Planning Control Center', icon: <ArrowRightLeft size={20} />, badge: pendingHandoverCount },
    { to: '/jobs', label: 'View Jobs', icon: <Briefcase size={20} /> },
  ];

  if (isAdmin) {
    navItems.push({ 
      to: '/admin/dashboard', 
      label: 'Job Late for Users', 
      icon: <ShieldCheck size={20} />,
      badge: overdueJobCount > 0 ? overdueJobCount : undefined,
      badgeColor: 'bg-rose-600 text-white'
    });
    navItems.push({ to: '/live-activity', label: 'Live Activity', icon: <History size={20} /> });
    navItems.push({ to: '/live-monitor', label: 'Live Monitor & Analytics', icon: <Activity size={20} /> });
  }

  navItems.push({ to: '/reports', label: 'Reports', icon: <FileText size={20} /> });

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path.split('?')[0]);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar
        user={user}
        deptName={deptName}
        navItems={navItems}
        isActive={isActive}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      
      <main className="relative flex-1 flex flex-col h-screen overflow-hidden bg-gradient-to-r from-cyan-200 via-purple-200 to-pink-200">

        {/* Top Header */}
        <header className="relative flex justify-end items-center px-8 py-4 bg-white/80 border-b border-slate-200 shadow-sm z-10 backdrop-blur-sm">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 text-slate-600 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </header>

        {/* Page Content */}
        <div className="relative flex-1 p-8 overflow-auto z-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
