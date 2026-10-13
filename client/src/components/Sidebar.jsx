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
        className={`fixed top-0 left-0 h-screen flex flex-col bg-slate-900 border-r border-slate-800 text-white z-40 transition-all duration-300 ease-in-out ${
          isExpanded ? 'w-64' : 'w-20'
        } ${
          isCollapsed && isHovered
            ? 'shadow-2xl shadow-black/70 ring-1 ring-slate-700/60'
            : ''
        }`}
      >
        {/* Top Header / Brand Logo & Toggle Button */}
        <div className="p-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 min-h-[96px]">
          {isExpanded ? (
            <div className="flex items-center gap-3 overflow-hidden">
              <img
                src="/21.png"
                alt="Swati Switchgears logo"
                className="h-16 md:h-18 w-auto max-w-[145px] object-contain drop-shadow-md shrink-0 transition-transform duration-200 hover:scale-105"
              />
              <div className="overflow-hidden whitespace-nowrap">
                <div className="text-[15px] font-bold text-slate-100 tracking-tight leading-tight">
                  Job Planning
                </div>
                <div className="text-[11px] text-blue-400 font-semibold uppercase tracking-wider">
                  Tracking System
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center py-1">
              <img
                src="/21.png"
                alt="Logo"
                className="h-12 w-12 object-contain drop-shadow-md transition-transform duration-200 hover:scale-110"
              />
            </div>
          )}

          {/* Toggle / Pin Button */}
          {isExpanded && (
            <button
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Pin Sidebar Open' : 'Collapse Sidebar'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            >
              {isCollapsed ? (
                <Pin size={18} className="text-blue-400 rotate-45" />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
          )}
        </div>

        {/* User / Department Info Badge */}
        {isExpanded ? (
          <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/60">
            <div className="font-semibold text-blue-400 text-sm truncate">
              {deptName}
            </div>
            <div className="text-slate-400 text-xs mt-0.5 truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {user?.username}
            </div>
          </div>
        ) : (
          <div
            className="py-3 px-2 border-b border-slate-800/80 flex justify-center"
            title={`${user?.username || 'User'} (${deptName})`}
          >
            <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-300 font-semibold text-xs flex items-center justify-center">
              {user?.username ? user.username.substring(0, 2).toUpperCase() : 'U'}
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 p-2 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {navItems
            .filter((item) => item.show !== false)
            .map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={!isExpanded ? item.label : undefined}
                  className={`relative flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  } ${!isExpanded ? 'justify-center' : ''}`}
                >
                  <span className="shrink-0 flex items-center justify-center">
                    {item.icon}
                  </span>
                  {isExpanded && (
                    <span className="truncate whitespace-nowrap tracking-wide">
                      {item.label}
                    </span>
                  )}
                  {/* Subtle active dot indicator when in compact rail mode */}
                  {!isExpanded && active && (
                    <span className="absolute right-1 w-1.5 h-1.5 rounded-full bg-white shadow-sm"></span>
                  )}
                </Link>
              );
            })}
        </nav>

        {/* Bottom Rail Toggle Button (Compact mode) */}
        {!isExpanded && (
          <div className="p-2 border-t border-slate-800 flex justify-center">
            <button
              onClick={onToggleCollapse}
              title="Expand Sidebar"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
