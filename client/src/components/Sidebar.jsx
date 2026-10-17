import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Pin
} from 'lucide-react';

export default function Sidebar({
  user,
  deptName,
  navItems,
  isActive,
  isCollapsed,
  onToggleCollapse
}) {
  const [isHovered, setIsHovered] = useState(false);

  // Expanded visually if not collapsed, or if currently being hovered in collapsed peek mode
  const isExpanded = !isCollapsed || isHovered;

  return (
    <>
      {/* Spacer div in flex layout: maintains layout width so main content does not jump on hover peek */}
      <div
        className={`shrink-0 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
        aria-hidden="true"
      />

      {/* Actual Sidebar: fixed position on left */}
      <aside
        onMouseEnter={() => isCollapsed && setIsHovered(true)}
        onMouseLeave={() => isCollapsed && setIsHovered(false)}
        className={`fixed top-0 left-0 h-screen flex flex-col bg-white border-r border-[#DCE5F0] text-[#172B4D] z-40 transition-all duration-300 ease-in-out ${
          isExpanded ? 'w-64' : 'w-20'
        } ${
          isCollapsed && isHovered
            ? 'shadow-2xl shadow-slate-400/30 ring-1 ring-slate-200'
            : 'shadow-xs'
        }`}
      >
        {/* Top Header / Brand Logo & Toggle Button */}
        <div className="p-3.5 bg-white border-b border-[#DCE5F0] flex items-center justify-between gap-3 min-h-[110px]">
          {isExpanded ? (
            <div className="flex items-center gap-3 overflow-hidden flex-1">
              <img
                src="/21.png"
                alt="Swati Switchgears logo"
                className="h-20 md:h-22 w-auto max-w-[160px] object-contain drop-shadow-md shrink-0 transition-transform duration-200 hover:scale-105"
              />
              <div className="overflow-hidden whitespace-nowrap">
                <div className="text-[15px] font-black text-[#172B4D] tracking-tight leading-tight">
                  Job Planning
                </div>
                <div className="text-[11px] text-[#1769FF] font-bold uppercase tracking-wider">
                  Tracking System
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center py-1">
              <img
                src="/21.png"
                alt="Logo"
                className="h-14 w-14 object-contain drop-shadow-md transition-transform duration-200 hover:scale-110"
              />
            </div>
          )}

          {/* Toggle / Pin Button */}
          {isExpanded && (
            <button
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Pin Sidebar Open' : 'Collapse Sidebar'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            >
              {isCollapsed ? (
                <Pin size={18} className="text-[#1769FF] rotate-45" />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
          )}
        </div>

        {/* User / Department Info Badge */}
        {isExpanded ? (
          <div className="p-3.5 border-b border-[#DCE5F0] bg-[#F8FAFC]">
            <div className="font-bold text-[#1769FF] text-xs uppercase tracking-wide truncate">
              {deptName}
            </div>
            <div className="text-[#172B4D] font-bold text-sm mt-0.5 truncate flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {user?.username}
            </div>
          </div>
        ) : (
          <div
            className="py-3 px-2 border-b border-[#DCE5F0] bg-[#F8FAFC] flex justify-center"
            title={`${user?.username || 'User'} (${deptName})`}
          >
            <div className="w-9 h-9 rounded-full bg-[#E8F1FF] border border-[#DCE5F0] text-[#1769FF] font-black text-xs flex items-center justify-center">
              {user?.username ? user.username.substring(0, 2).toUpperCase() : 'U'}
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden">
          {navItems
            .filter((item) => item.show !== false)
            .map((item, idx) => {
              if (item.section) {
                if (!isExpanded) return <div key={`sep-${idx}`} className="my-2 border-t border-[#DCE5F0]" />;
                return (
                  <div key={`sec-${idx}`} className="pt-3.5 pb-1 px-3 text-[10px] font-bold text-[#64748B] uppercase tracking-wider select-none">
                    {item.section}
                  </div>
                );
              }

              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={!isExpanded ? item.label : undefined}
                  className={`relative flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    active
                      ? 'bg-[#E8F1FF] text-[#1769FF] font-bold shadow-xs border border-[#DCE5F0]/60'
                      : 'text-[#64748B] hover:text-[#172B4D] hover:bg-[#F8FAFC] font-medium'
                  } ${!isExpanded ? 'justify-center' : ''}`}
                >
                  <span className={`shrink-0 flex items-center justify-center ${active ? 'text-[#1769FF]' : 'text-[#64748B]'}`}>
                    {item.icon}
                  </span>
                  {isExpanded && (
                    <span className="truncate whitespace-nowrap tracking-wide flex-1">
                      {item.label}
                    </span>
                  )}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`rounded-full font-black transition-all ${
                      isExpanded
                        ? 'px-2 py-0.5 text-[10px] bg-[#E8F1FF] text-[#1769FF] border border-[#DCE5F0] ml-auto shadow-xs'
                        : 'absolute -top-1 -right-1 w-4 h-4 p-0 flex items-center justify-center bg-[#1769FF] text-white text-[9px] shadow-sm ring-2 ring-white'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                  {/* Subtle active indicator when in compact rail mode */}
                  {!isExpanded && active && !item.badge && (
                    <span className="absolute right-1 w-1.5 h-1.5 rounded-full bg-[#1769FF] shadow-xs"></span>
                  )}
                </Link>
              );
            })}
        </nav>

        {/* Bottom Rail Toggle Button (Compact mode) */}
        {!isExpanded && (
          <div className="p-2 border-t border-[#DCE5F0] flex justify-center bg-white">
            <button
              onClick={onToggleCollapse}
              title="Expand Sidebar"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
