import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Search, Bell, ChevronDown, LogOut,
  PlusCircle, Layers, ArrowRightLeft, Settings
} from 'lucide-react';

const ROUTE_PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/admin/dashboard': 'Admin Dashboard',
  '/jobs/new': 'New Job Registration',
  '/search-jobs': 'Search Jobs',
  '/incoming-jobs': 'Incoming Jobs',
  '/my-tasks': 'My Department Tasks',
  '/my-jobs': 'My Assigned Jobs',
  '/admin/users': 'User Management',
  '/jobs/handover': 'Planning Control Center',
  '/jobs/handover/planning': 'Planning Control Center',
  '/admin/late-jobs': 'Job Late for Users',
  '/live-activity': 'Live Activity Stream',
  '/live-monitor': 'Live Monitor & Analytics',
  '/reports': 'Reports & Exports',
  '/chart': 'Analytics Charts'
};

export default function TopHeader({
  pendingCount = 0,
  deptName = 'Administrator'
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const dropdownRef = useRef(null);

  const role = (user?.role || '').toLowerCase();
  const username = (user?.username || '').toLowerCase();
  const isKeval = username === 'keval v shah' || username === 'keval' || username === 'kevalvshah';
  const isAdmin = role === 'admin' || role === 'executive' || role === 'superadmin' || isKeval;

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute page title based on route
  const currentTitle = useMemo(() => {
    const path = location.pathname;
    if (ROUTE_PAGE_TITLES[path]) return ROUTE_PAGE_TITLES[path];
    if (path.startsWith('/jobs/edit/')) return 'Edit Job';
    if (path.startsWith('/jobs/')) return 'Job Details';
    return 'Job Planning System';
  }, [location.pathname]);

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/login');
  };

  const handleNavigate = (path) => {
    setDropdownOpen(false);
    navigate(path);
  };

  const displayName = user?.name || user?.username || 'User';
  const displayEmail = user?.email || (user?.username ? `${user.username.toLowerCase().replace(/\s+/g, '')}@swatiswitchgears.com` : 'user@swatiswitchgears.com');
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'U';

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (headerSearch.trim()) {
      navigate(`/search-jobs?search=${encodeURIComponent(headerSearch.trim())}`);
    }
  };

  return (
    <header className="relative w-full h-[70px] bg-white border-b border-[#E2E8F0] px-5 sm:px-6 flex items-center justify-between z-30 select-none">
      {/* LEFT SIDE — Dynamic Route Page Title */}
      <div className="flex items-center gap-4">
        <h1 className="text-[17px] font-bold text-slate-800 tracking-tight leading-none">
          {currentTitle}
        </h1>
      </div>

      {/* CENTER / EMPTY SPACE — Intentionally Spacious */}
      <div className="flex-1" />

      {/* RIGHT SIDE — Notification Bell -> Search Bar -> User Profile Dropdown */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {/* 1. Notification / Bell Outline Icon */}
        <button
          type="button"
          onClick={() => navigate('/incoming-jobs')}
          className="relative text-slate-600 hover:text-slate-900 transition-colors p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
          title={pendingCount > 0 ? `${pendingCount} pending notifications` : 'Notifications'}
        >
          <Bell size={18} strokeWidth={1.8} />
          {pendingCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </button>

        {/* 2. Search Box on Right Side of Notification Icon (Refined rounded borders, no Cmd K badge) */}
        <form onSubmit={handleSearchSubmit} className="relative w-[190px] sm:w-[220px] h-[36px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            value={headerSearch}
            onChange={(e) => setHeaderSearch(e.target.value)}
            className="w-full h-full pl-9 pr-3 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200 rounded-full text-[12.5px] text-slate-800 placeholder-slate-400 font-medium focus:outline-none focus:ring-1 focus:ring-[#0000AA] focus:border-[#0000AA] transition-all shadow-2xs"
          />
        </form>

        {/* 3. USER PROFILE SECTION WITH MODERN DROPDOWN (MATCHING REFERENCE IMAGE) */}
        <div className="relative ml-1" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2.5 sm:gap-3 p-1 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group text-left"
          >
            {/* Avatar */}
            <div className="w-[38px] h-[38px] rounded-full bg-gradient-to-br from-[#0000AA] to-indigo-700 text-white flex items-center justify-center font-bold text-[13px] shadow-2xs shrink-0 ring-1 ring-slate-200/80">
              {initial}
            </div>

            {/* User Info (Name & Email) */}
            <div className="hidden md:flex flex-col min-w-0 pr-1">
              <span className="text-[13px] font-semibold text-slate-900 tracking-tight leading-tight truncate max-w-[130px]">
                {displayName}
              </span>
              <span className="text-[11px] font-normal text-slate-400 leading-tight mt-0.5 truncate max-w-[130px]">
                {displayEmail}
              </span>
            </div>

            {/* Dropdown Chevron */}
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={`text-slate-400 group-hover:text-slate-700 transition-transform duration-200 shrink-0 ${
                dropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Interactive Dropdown Menu Designed per Reference Image */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2.5 w-[275px] bg-white rounded-2xl shadow-xl border border-slate-200/90 p-3 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
              {/* User Identity Header */}
              <div className="flex items-center gap-3 px-1 py-1">
                {/* Circular Avatar in Primary Color */}
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#0000AA] to-indigo-700 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0 ring-2 ring-white">
                  {initial}
                </div>

                {/* Name & Email (from PostgreSQL) */}
                <div className="min-w-0 flex-1">
                  <h4 className="text-[14.5px] font-bold text-slate-900 tracking-tight leading-tight truncate">
                    {displayName}
                  </h4>
                  <p className="text-[12px] text-slate-500 truncate mt-0.5 leading-tight">
                    {displayEmail}
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100 my-2" />

              {/* Navigation Menu Items */}
              <div className="space-y-0.5 py-0.5">
                {/* My Jobs */}
                <button
                  type="button"
                  onClick={() => handleNavigate('/my-jobs')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-left"
                >
                  <Layers size={17} className="text-slate-500 shrink-0" strokeWidth={1.8} />
                  <span>My Jobs</span>
                </button>

                {/* Create Job */}
                <button
                  type="button"
                  onClick={() => handleNavigate('/jobs/new')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-left"
                >
                  <PlusCircle size={17} className="text-slate-500 shrink-0" strokeWidth={1.8} />
                  <span>Create Job</span>
                </button>

                {/* Planning Control Center (Admin Only) */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleNavigate('/jobs/handover')}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <ArrowRightLeft size={17} className="text-slate-500 shrink-0" strokeWidth={1.8} />
                      <span>Planning Control Center</span>
                    </div>
                    {pendingCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                )}

                {/* Users & Settings (Admin Only) */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleNavigate('/admin/users')}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-left"
                  >
                    <Settings size={17} className="text-slate-500 shrink-0" strokeWidth={1.8} />
                    <span>Settings & Users</span>
                  </button>
                )}
              </div>

              {/* Divider above Log Out */}
              <div className="border-t border-slate-100 my-1.5" />

              {/* Log Out Button matching screenshot */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-slate-700 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left group"
              >
                <LogOut size={17} className="text-slate-500 group-hover:text-rose-600 transition-colors shrink-0" strokeWidth={1.8} />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
