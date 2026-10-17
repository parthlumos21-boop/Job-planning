import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import {
  LayoutDashboard, PlusCircle,
  FileBarChart, User, LogOut, Activity, FileText,
  UserCheck, ArrowRightLeft, ShieldCheck, History, Search, CheckSquare,
  Cpu, Wrench, ShoppingCart, Truck
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
    { section: 'CORE' },
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { to: '/jobs/new', label: 'New Job', icon: <PlusCircle size={18} /> },
    { to: '/search-jobs', label: 'Search Jobs', icon: <Search size={18} /> },

    { section: 'MY WORKSPACE' },
    { to: '/my-tasks', label: 'My Tasks', icon: <CheckSquare size={18} /> },
    { to: '/my-jobs', label: 'My Jobs', icon: <UserCheck size={18} /> },

    // Dynamic Department Workflow Scoping
    ...(() => {
      const ALL_DEPT_ITEMS = [
        { key: 'design', to: '/jobs?department=design', label: 'Design- Electrical', icon: <Cpu size={18} /> },
        { key: 'mechanical', to: '/jobs?department=mechanical', label: 'Design- Mechanical', icon: <Wrench size={18} /> },
        { key: 'purchase', to: '/jobs?department=purchase', label: 'Procurement', icon: <ShoppingCart size={18} /> },
        { key: 'production', to: '/jobs?department=production', label: 'Production & QC & Dispatch', icon: <Truck size={18} /> },
      ];

      const normalizeDeptKey = (d) => {
        const s = (d || '').toLowerCase();
        if (s.includes('market')) return 'marketing';
        if (s.includes('mech')) return 'mechanical';
        if (s.includes('elect') || s.includes('design')) return 'design';
        if (s.includes('purch') || s.includes('proc')) return 'purchase';
        if (s.includes('prod') || s.includes('qc') || s.includes('disp')) return 'production';
        return s || 'marketing';
      };

      const userDepts = (user?.departments || []).map(normalizeDeptKey);
      const visibleDepts = isAdmin
        ? ALL_DEPT_ITEMS
        : ALL_DEPT_ITEMS.filter(dept => userDepts.includes(dept.key));

      if (visibleDepts.length === 0) return [];
      return [{ section: 'DEPARTMENT WORKFLOW' }, ...visibleDepts];
    })(),
  ];

  if (isAdmin) {
    navItems.push({ section: 'MANAGEMENT & AUDIT' });
    navItems.push({ to: '/jobs/handover', label: 'Planning Control Center', icon: <ArrowRightLeft size={18} />, badge: pendingHandoverCount });
    navItems.push({ 
      to: '/admin/dashboard', 
      label: 'Job Late for Users', 
      icon: <ShieldCheck size={18} />
    });
    if (isKeval) {
      navItems.push({ to: '/live-activity', label: 'Live Activity', icon: <History size={18} /> });
    }
    navItems.push({ to: '/live-monitor', label: 'Live Monitor & Analytics', icon: <Activity size={18} /> });
    navItems.push({ to: '/reports', label: 'Reports', icon: <FileText size={18} /> });
  }

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path.split('?')[0]);
  };

  return (
    <div className="min-h-screen flex bg-[#F5F8FC]">
      <Sidebar
        user={user}
        deptName={deptName}
        navItems={navItems}
        isActive={isActive}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      
      <main className="relative flex-1 flex flex-col h-screen overflow-hidden bg-[#F5F8FC]">

        {/* Top Header */}
        <header className="relative flex justify-end items-center px-6 py-3.5 bg-white border-b border-[#DCE5F0] shadow-xs z-10">
          {/* Right: User Department Pill & Logout */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F8FAFC] rounded-xl border border-[#DCE5F0] text-xs font-semibold text-[#172B4D]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[#1769FF] font-bold uppercase">{deptName}</span>
              <span className="text-[#DCE5F0]">•</span>
              <span className="font-bold">{user?.username}</span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 text-[#64748B] hover:text-[#B91C1C] hover:bg-[#FEE2E2] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-[#DCE5F0]"
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="relative flex-1 p-6 md:p-8 overflow-auto z-10 bg-[#F5F8FC]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
