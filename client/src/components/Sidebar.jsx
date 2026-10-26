import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight
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
  const [hoveredItemKey, setHoveredItemKey] = useState(null);

  // Expanded visually if not collapsed, or if currently being hovered in collapsed peek mode
  const isExpanded = !isCollapsed || isHovered;

  return (
    <>
      {/* Spacer div in flex layout: maintains layout width so main content does not jump on hover peek */}
      <div
        className={`shrink-0 transition-all duration-200 ease-in-out ${
          isCollapsed ? 'w-[68px]' : 'w-[224px]'
        }`}
        aria-hidden="true"
      />

      {/* Actual Sidebar: fixed position on left */}
      <aside
        onMouseEnter={() => isCollapsed && setIsHovered(true)}
        onMouseLeave={() => {
          if (isCollapsed) {
            setIsHovered(false);
            setHoveredItemKey(null);
          }
        }}
        className={`fixed top-0 left-0 h-screen flex flex-col bg-white border-r border-[#E2E8F0] text-[#172B4D] z-40 transition-all duration-200 ease-in-out ${
          isExpanded ? 'w-[224px]' : 'w-[68px]'
        } ${
          isCollapsed && isHovered
            ? 'shadow-xl shadow-slate-900/10'
            : 'shadow-2xs'
        }`}
      >
        {/* Top Header: Brand Logo & Collapse Toggle (Prominent & Balanced) */}
        <div className="px-3.5 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-2 min-h-[76px]">
          {isExpanded ? (
            <div className="flex items-center gap-2.5 overflow-hidden flex-1">
              <img
                src="/21.png"
                alt="Swati Switchgears logo"
                className="h-14 md:h-16 w-auto max-w-[145px] object-contain drop-shadow-xs shrink-0 transition-transform duration-200 hover:scale-105"
              />
              <div className="overflow-hidden whitespace-nowrap">
                <div className="text-[13px] font-bold text-[#1E293B] tracking-tight leading-tight">
                  Job Planning
                </div>
                <div className="text-[10px] text-[#0000AA] font-bold uppercase tracking-wider">
                  Tracking System
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center gap-1.5 py-0.5">
              <img
                src="/21.png"
                alt="Logo"
                className="h-9 w-9 object-contain drop-shadow-xs transition-transform duration-200 hover:scale-105"
              />
              <button
                onClick={onToggleCollapse}
                title="Expand Sidebar"
                className="h-5 w-5 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-blue-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200 shadow-2xs"
              >
                <ChevronRight size={13} strokeWidth={2.2} />
              </button>
            </div>
          )}

          {/* Collapse Toggle Button (When Expanded) */}
          {isExpanded && (
            <button
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Pin Sidebar Open' : 'Collapse Sidebar'}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
            >
              <PanelLeftClose size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems
            .filter((item) => item.show !== false)
            .map((item, idx) => {
              if (item.section) {
                if (!isExpanded) return <div key={`sep-${idx}`} className="my-1.5 border-t border-[#E2E8F0]/80" />;
                return (
                  <div
                    key={`sec-${idx}`}
                    className="pt-3 pb-1 px-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider select-none"
                  >
                    {item.section}
                  </div>
                );
              }

              const active = isActive(item.to);
              const uniqueKey = item.to || item.label;

              return (
                <div
                  key={uniqueKey}
                  className="relative"
                  onMouseEnter={() => !isExpanded && setHoveredItemKey(uniqueKey)}
                  onMouseLeave={() => !isExpanded && setHoveredItemKey(null)}
                >
                  <Link
                    to={item.to}
                    className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13px] transition-all min-h-[38px] ${
                      active
                        ? 'bg-[#EDF2F7] text-[#1E293B] font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/90 font-medium'
                    } ${!isExpanded ? 'justify-center' : ''}`}
                  >
                    {/* Outline icon */}
                    <span
                      className={`shrink-0 flex items-center justify-center transition-colors ${
                        active
                          ? 'text-[#0000AA]'
                          : 'text-slate-400 group-hover:text-slate-600'
                      }`}
                    >
                      {item.icon}
                    </span>

                    {/* Label (Expanded) */}
                    {isExpanded && (
                      <span className="truncate whitespace-nowrap tracking-tight flex-1">
                        {item.label}
                      </span>
                    )}

                    {/* Notification Badge */}
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`rounded-full font-bold transition-all ${
                          isExpanded
                            ? 'px-2 py-0.2 text-[10px] bg-slate-100 text-slate-700 border border-slate-200/90 ml-auto'
                            : 'absolute top-1 right-1 w-4 h-4 p-0 flex items-center justify-center bg-[#0000AA] text-white text-[9px] shadow-2xs ring-2 ring-white'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>

                  {/* Floating Tooltip (Collapsed Hover) */}
                  {!isExpanded && hoveredItemKey === uniqueKey && (
                    <div className="absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none flex items-center gap-2 animate-in fade-in-50 duration-150">
                      <span>{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-[#0000AA] text-white">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </nav>
      </aside>
    </>
  );
}
