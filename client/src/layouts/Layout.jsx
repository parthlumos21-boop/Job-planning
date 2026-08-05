import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, PlusCircle, Briefcase,
  FileBarChart, User, LogOut, Activity, FileText
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const primaryDept = user?.departments?.[0] || 'admin';
  const deptName = user?.role === 'admin' || user?.role === 'executive'
    ? 'Administrator'
    : DEPT_DISPLAY_NAMES[primaryDept] || primaryDept;

  const isMarketingOrAdmin = user?.departments?.includes('marketing') || user?.role === 'admin' || user?.role === 'executive';

  const isKeval = user?.username?.toLowerCase() === 'keval v shah';

  let navItems = [];

  if (isKeval) {
    navItems.push({ to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> });
    navItems.push({ to: '/jobs/new', label: 'New Job', icon: <PlusCircle size={20} /> });
    navItems.push({ to: '/jobs', label: 'View Jobs', icon: <Briefcase size={20} /> });
    navItems.push({ to: '/live-monitor', label: 'Live Monitor Users', icon: <Activity size={20} /> });
    navItems.push({ to: '/reports', label: 'Reports', icon: <FileText size={20} /> });
  } else {
    navItems.push({ to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> });
    navItems.push({ to: '/jobs/new', label: 'New Job', icon: <PlusCircle size={20} /> });
    navItems.push({ to: '/jobs', label: 'View Jobs', icon: <Briefcase size={20} /> });
    navItems.push({ to: '/reports', label: 'Reports', icon: <FileText size={20} /> });

  }

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path.split('?')[0]);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 z-20">
        <div className="p-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <img
              src="/21.png"
              alt="Swati Switchgears logo"
              className="h-20 w-auto object-contain drop-shadow-sm"
            />
            <div>
              <div className="text-[15px] font-bold text-slate-300 leading-tight">Job Planning System</div>
            </div>
          </div>
        </div>
        <div className="p-4 border-b border-slate-800">
          <div className="font-semibold text-blue-400 text-lg">{deptName}</div>
          <div className="text-slate-400 text-base mt-0.5">{user?.username}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.filter(item => item.show !== false).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.to)
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      
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
