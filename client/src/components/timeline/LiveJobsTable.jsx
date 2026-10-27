import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Eye, User, ArrowRightLeft, Activity,
  Calendar, Play, Pause, CheckCircle2, ChevronLeft, ChevronRight,
  Search, X, Filter, ExternalLink
} from 'lucide-react';

const DEPARTMENT_TABS = [
  { key: 'all', label: 'All Jobs' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'design', label: 'Electrical Design' },
  { key: 'mechanical', label: 'Mechanical Design' },
  { key: 'purchase', label: 'Procurement' },
  { key: 'production', label: 'Production' },
  { key: 'qc', label: 'Quality Control' },
  { key: 'dispatch', label: 'Dispatch' }
];

function formatTime(sec) {
  if (sec === null || sec === undefined || isNaN(sec) || sec < 0) return '00:00:00';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function LiveJobsTable({
  jobs = [],
  selectedJobId,
  onSelectJob,
  onOpenHandover,
  onOpenProgress,
  onOpenTimeline,
  onOpenHistory,
  onStartJob,
  onPauseJob,
  onResumeJob,
  actionLoading,
  currentTimeMs
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Per-column search filters
  const [columnFilters, setColumnFilters] = useState({
    jobNo: '',
    panelCustomer: '',
    priority: '',
    status: '',
    worker: '',
    assignee: '',
    elapsed: '',
    progress: '',
    handover: '',
  });

  const handleColumnFilterChange = (key, val) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const clearAllColumnFilters = () => {
    setColumnFilters({
      jobNo: '',
      panelCustomer: '',
      priority: '',
      status: '',
      worker: '',
      assignee: '',
      elapsed: '',
      progress: '',
      handover: '',
    });
    setCurrentPage(1);
  };

  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => Boolean(v && v.trim()));

  // Filter jobs by active department tab, global search, and per-column search
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      // 1. Department tab filter
      if (activeTab !== 'all') {
        const jStage = String(j.currentStage || '').toLowerCase();
        const jDept = String(j.department || '').toLowerCase();
        const jDeptKey = String(j.departmentKey || '').toLowerCase();
        const matchTab = jStage.includes(activeTab) || jDept.includes(activeTab) || jDeptKey.includes(activeTab);
        if (!matchTab) return false;
      }

      // 2. Global Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const jNo = String(j.jobNo || j.id || '').toLowerCase();
        const pName = String(j.panelName || '').toLowerCase();
        const cName = String(j.clientName || '').toLowerCase();
        const wName = String(j.currentWorkerName || '').toLowerCase();
        if (!jNo.includes(q) && !pName.includes(q) && !cName.includes(q) && !wName.includes(q)) {
          return false;
        }
      }

      // 3. Per-column filters (case-insensitive)
      if (columnFilters.jobNo.trim()) {
        const q = columnFilters.jobNo.toLowerCase().trim();
        const val = String(j.jobNo || j.id || '').toLowerCase();
        if (!val.includes(q)) return false;
      }

      if (columnFilters.panelCustomer.trim()) {
        const q = columnFilters.panelCustomer.toLowerCase().trim();
        const pName = String(j.panelName || '').toLowerCase();
        const cName = String(j.clientName || '').toLowerCase();
        if (!pName.includes(q) && !cName.includes(q)) return false;
      }

      if (columnFilters.priority.trim()) {
        const q = columnFilters.priority.toLowerCase().trim();
        const prio = String(j.priority || 'normal').toLowerCase();
        if (!prio.includes(q)) return false;
      }

      if (columnFilters.status.trim()) {
        const q = columnFilters.status.toLowerCase().trim();
        const st = String(j.status || 'draft').toLowerCase();
        if (!st.includes(q)) return false;
      }

      if (columnFilters.worker.trim()) {
        const q = columnFilters.worker.toLowerCase().trim();
        const wName = String(j.currentWorkerName || j.assignedEngineer || '').toLowerCase();
        const wPos = String(j.currentWorkerPosition || '').toLowerCase();
        if (!wName.includes(q) && !wPos.includes(q)) return false;
      }

      if (columnFilters.assignee.trim()) {
        const q = columnFilters.assignee.toLowerCase().trim();
        const prev = String(j.previousWorkerName || '').toLowerCase();
        const next = String(j.nextWorkerName || '').toLowerCase();
        if (!prev.includes(q) && !next.includes(q)) return false;
      }

      if (columnFilters.elapsed.trim()) {
        const q = columnFilters.elapsed.toLowerCase().trim();
        const elapsedSec = getJobElapsed(j);
        const formatted = formatTime(elapsedSec).toLowerCase();
        const estText = `${(Number(j.estimatedDurationSeconds || 28800) / 3600).toFixed(1)}h`.toLowerCase();
        if (!formatted.includes(q) && !estText.includes(q)) return false;
      }

      if (columnFilters.progress.trim()) {
        const q = columnFilters.progress.toLowerCase().trim();
        const prog = String(j.progressPercentage ?? 0).toLowerCase();
        const estSeconds = j.estimatedDurationSeconds || 28800;
        const budgetPercent = String(Math.min(100, Math.round((getJobElapsed(j) / estSeconds) * 100)));
        if (!prog.includes(q) && !budgetPercent.includes(q)) return false;
      }

      if (columnFilters.handover.trim()) {
        const q = columnFilters.handover.toLowerCase().trim();
        const hand = String(j.handoverStatus || j.handoverReason || '').toLowerCase();
        if (!hand.includes(q)) return false;
      }

      return true;
    });
  }, [jobs, activeTab, searchTerm, columnFilters]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = {};
    DEPARTMENT_TABS.forEach((t) => {
      if (t.key === 'all') {
        counts[t.key] = jobs.length;
      } else {
        counts[t.key] = jobs.filter((j) => {
          const jStage = String(j.currentStage || '').toLowerCase();
          const jDept = String(j.department || '').toLowerCase();
          const jDeptKey = String(j.departmentKey || '').toLowerCase();
          return jStage.includes(t.key) || jDept.includes(t.key) || jDeptKey.includes(t.key);
        }).length;
      }
    });
    return counts;
  }, [jobs]);

  // Reset page when tab or search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  // Sliding window page numbers for pagination
  const visiblePages = useMemo(() => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  // Helper for elapsed seconds
  const getJobElapsed = (j) => {
    const base = Number(j.actualDurationSeconds) || 0;
    if ((j.status === 'Running' || j.status === 'In Progress') && j.sessionStartAt) {
      const liveDelta = Math.max(0, Math.floor(((currentTimeMs || Date.now()) - new Date(j.sessionStartAt).getTime()) / 1000));
      return base + liveDelta;
    }
    return base;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
      {/* 0. Top Table Header Bar with "View All" Button & Title */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gradient-to-r from-slate-50 via-white to-slate-50/60">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Live Active Jobs &amp; Planning Control Center
          </h2>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200/60">
            {filteredJobs.length} {filteredJobs.length === 1 ? 'Job' : 'Jobs'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Rounded Pill Search Bar */}
          <div className="relative w-56 sm:w-64 md:w-72">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Job No, Panel, Customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 hover:border-slate-400 rounded-full text-xs focus:outline-none focus:border-[#0000AA] focus:ring-2 focus:ring-[#0000AA]/15 text-slate-800 placeholder-slate-400 font-medium transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                title="Clear Search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <Link
            to="/admin/jobs-track"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0000AA] hover:bg-[#000088] text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer shrink-0"
            title="View full jobs table on dedicated page"
          >
            <span>View All</span>
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>

      {/* Main Container with GAP between Tabs and Table */}
      <div className="p-4 sm:p-5 space-y-3.5 bg-slate-50/40">
        {/* 1. Connected Department Tabs Strip (Contained Tab Bar as per Reference Image) */}
        <div className="border border-slate-200 rounded-lg bg-slate-50/70 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300">
            <div className="flex items-stretch min-w-max divide-x divide-slate-200">
              {DEPARTMENT_TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                const count = tabCounts[tab.key] || 0;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer relative ${
                      isActive
                        ? 'bg-white text-blue-600 font-bold border-t-2 border-t-blue-600 shadow-2xs'
                        : 'bg-slate-50/60 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-t-2 border-t-transparent'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-xs ${isActive ? 'text-blue-600 font-bold' : 'text-slate-500 font-normal'}`}>
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Independent Table Container as per Reference Image */}
        <div className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left border-collapse text-xs min-w-[1050px]">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                {/* Row 1: Column Header Names with vertical cell dividers */}
                <tr className="divide-x divide-slate-200">
                  <th className="py-2.5 px-2.5 whitespace-nowrap">Job Number</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">Panel &amp; Customer</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">Priority</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">Current Worker &amp; Position</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">Prev / Next Assignee</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap font-mono">Live Elapsed Time</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">Progress / Budget</th>
                  <th className="py-2.5 px-2 whitespace-nowrap text-center">Handover</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-center">Execution</th>
                </tr>

                {/* Row 2: Per-Column Search Bars (Case-insensitive matching Reference Image) */}
                <tr className="bg-slate-100/70 border-t border-slate-200 divide-x divide-slate-200 normal-case font-normal text-[11px]">
                  {/* Job Number Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.jobNo}
                      onChange={(e) => handleColumnFilterChange('jobNo', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Panel & Customer Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.panelCustomer}
                      onChange={(e) => handleColumnFilterChange('panelCustomer', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Priority Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.priority}
                      onChange={(e) => handleColumnFilterChange('priority', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Status Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.status}
                      onChange={(e) => handleColumnFilterChange('status', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Worker & Position Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.worker}
                      onChange={(e) => handleColumnFilterChange('worker', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Prev/Next Assignee Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.assignee}
                      onChange={(e) => handleColumnFilterChange('assignee', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Live Elapsed Time Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.elapsed}
                      onChange={(e) => handleColumnFilterChange('elapsed', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Progress / Budget Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.progress}
                      onChange={(e) => handleColumnFilterChange('progress', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Handover Search */}
                  <th className="p-1.5">
                    <input
                      type="text"
                      placeholder="Search here ..."
                      value={columnFilters.handover}
                      onChange={(e) => handleColumnFilterChange('handover', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                    />
                  </th>
                  {/* Clear / Action Column Header */}
                  <th className="p-1.5 text-center">
                    {hasActiveColumnFilters ? (
                      <button
                        onClick={clearAllColumnFilters}
                        className="px-2 py-1 rounded text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                        title="Clear all column searches"
                      >
                        Clear
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-normal">—</span>
                    )}
                  </th>
                </tr>
              </thead>
          <tbody className="divide-y divide-slate-100 font-normal bg-white">
            {paginatedJobs.length === 0 ? (
              <tr>
                <td colSpan="10" className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <Clock size={22} className="text-slate-300" />
                    <p className="font-semibold text-slate-600 text-xs">No jobs currently matching this criteria.</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedJobs.map((j) => {
                const elapsedSeconds = getJobElapsed(j);
                const isRunning = j.status === 'Running' || j.status === 'In Progress';
                const isPaused = j.status === 'Paused' || j.status === 'On Hold';
                const isCompleted = j.status === 'Completed';
                const isDraft = !isRunning && !isPaused && !isCompleted;
                const isSelected = selectedJobId === j.id;

                const estSeconds = j.estimatedDurationSeconds || 28800;
                const budgetPercent = Math.min(100, Math.round((elapsedSeconds / estSeconds) * 100));

                return (
                  <tr
                    key={j.id}
                    onClick={() => onSelectJob && onSelectJob(j)}
                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/40 ring-1 ring-inset ring-blue-200' : ''
                    }`}
                  >
                    {/* 1. JOB NUMBER */}
                    <td className="py-1.5 px-2.5 whitespace-nowrap align-middle">
                      <div className="inline-flex items-center gap-1 font-bold text-[11px] text-blue-600 hover:text-blue-800">
                        <span>#{j.jobNo || j.id}</span>
                        <Eye size={11} className="text-blue-500 opacity-80" />
                      </div>
                    </td>

                    {/* 2. PANEL & CUSTOMER (Stacked) */}
                    <td className="py-1.5 px-2.5 align-middle max-w-[170px]">
                      <div className="text-slate-900 font-bold text-[11px] leading-snug truncate" title={j.panelName}>
                        {j.panelName || 'Standard Panel'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5" title={j.clientName}>
                        {j.clientName || 'General Client'}
                      </div>
                    </td>

                    {/* 3. PRIORITY */}
                    <td className="py-1.5 px-2 align-middle whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border ${
                          j.priority === 'Urgent'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : j.priority === 'High'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200/70'
                        }`}
                      >
                        {j.priority === 'Urgent' && <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />}
                        {j.priority || 'NORMAL'}
                      </span>
                    </td>

                    {/* 4. STATUS */}
                    <td className="py-1.5 px-2 align-middle whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isRunning
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isPaused
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : isCompleted
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        {isPaused && <Pause size={9} />}
                        {isCompleted && <CheckCircle2 size={10} />}
                        {isDraft && <Clock size={10} className="text-slate-400" />}
                        <span>{j.status || 'Draft'}</span>
                      </span>
                    </td>

                    {/* 5. CURRENT WORKER & POSITION */}
                    <td className="py-1.5 px-2.5 align-middle max-w-[150px]">
                      <div className="font-bold text-slate-900 text-[11px] flex items-center gap-1 truncate" title={j.currentWorkerName}>
                        <User size={11} className="text-blue-600 shrink-0" />
                        <span className="truncate">{j.currentWorkerName || j.assignedEngineer || 'Unassigned'}</span>
                      </div>
                      <div className="inline-flex items-center text-[9px] font-medium text-slate-600 bg-slate-50 border border-slate-200 px-1 py-0.2 rounded mt-0.5">
                        {j.currentWorkerPosition || 'Engineer'}
                      </div>
                    </td>

                    {/* 6. PREV / NEXT ASSIGNEE */}
                    <td className="py-1.5 px-2 align-middle whitespace-nowrap text-[10px]">
                      <div className="text-slate-500 flex items-center gap-1">
                        <span className="text-slate-400 font-medium">Prev:</span>
                        <span className="font-medium text-slate-600">{j.previousWorkerName || '—'}</span>
                      </div>
                      <div className="text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                        <span className="text-slate-400">Next:</span>
                        <span className={j.nextWorkerName && j.nextWorkerName !== 'Not yet assigned' ? 'text-indigo-600 font-semibold' : 'text-slate-400'}>
                          {j.nextWorkerName || 'Not yet assigned'}
                        </span>
                      </div>
                    </td>

                    {/* 7. LIVE ELAPSED TIME */}
                    <td className="py-1.5 px-2.5 align-middle whitespace-nowrap font-mono">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                        <Clock size={11} className={isRunning ? 'text-emerald-600 animate-pulse' : 'text-slate-400'} />
                        <span>{formatTime(elapsedSeconds)}</span>
                      </div>
                      <div className="text-[9px] text-slate-400 font-sans mt-0.5">
                        Est: {(estSeconds / 3600).toFixed(1)}h
                      </div>
                    </td>

                    {/* 8. PROGRESS / BUDGET */}
                    <td className="py-1.5 px-2.5 align-middle min-w-[100px]">
                      <div className="text-[9px] font-semibold text-slate-600 mb-0.5">
                        {budgetPercent}% used
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            budgetPercent > 100 ? 'bg-rose-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, budgetPercent)}%` }}
                        />
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                        {j.progressPercentage ?? 0}% completed
                      </div>
                    </td>

                    {/* 9. HANDOVER (Dedicated button matching Image 2) */}
                    <td className="py-1.5 px-2 align-middle text-center whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenHandover && onOpenHandover(j);
                        }}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[5px] bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300 shadow-2xs transition-all cursor-pointer"
                        title="Transfer work to another engineer or shift"
                      >
                        <ArrowRightLeft size={10} />
                        <span>Handover</span>
                      </button>
                    </td>

                    {/* 10. EXECUTION (Dedicated action group matching Image 2) */}
                    <td className="py-1.5 px-2.5 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {/* Progress Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProgress && onOpenProgress(j);
                          }}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[5px] bg-blue-50 hover:bg-blue-100 text-blue-600 text-[10px] font-bold border border-blue-200 shadow-2xs transition-all cursor-pointer"
                          title="Update Progress"
                        >
                          <Activity size={10} />
                          <span>Progress</span>
                        </button>

                        {/* Calendar Milestone Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenTimeline && onOpenTimeline(j);
                          }}
                          className="p-1 rounded-[5px] bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 shadow-2xs transition-all cursor-pointer"
                          title="View Milestones & Timeline"
                        >
                          <Calendar size={11} />
                        </button>

                        {/* Clock History Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenHistory && onOpenHistory(j.id);
                          }}
                          className="p-1 rounded-[5px] bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 shadow-2xs transition-all cursor-pointer"
                          title="View Audit History"
                        >
                          <Clock size={11} />
                        </button>

                        {/* Start / Pause / Resume Execution Button */}
                        {isDraft && onStartJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartJob(j.id);
                            }}
                            disabled={actionLoading === `start-${j.id}`}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[5px] bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                            title="Start Execution"
                          >
                            <Play size={10} fill="currentColor" />
                            <span>Start</span>
                          </button>
                        )}

                        {isRunning && onPauseJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPauseJob(j.id);
                            }}
                            disabled={actionLoading === `pause-${j.id}`}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[5px] bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                            title="Pause Execution"
                          >
                            <Pause size={10} fill="currentColor" />
                            <span>Pause</span>
                          </button>
                        )}

                        {isPaused && onResumeJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onResumeJob(j.id);
                            }}
                            disabled={actionLoading === `resume-${j.id}`}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[5px] bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                            title="Resume Execution"
                          >
                            <Play size={10} fill="currentColor" />
                            <span>Resume</span>
                          </button>
                        )}

                        {isCompleted && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600 px-1.5 py-0.5">
                            <CheckCircle2 size={11} />
                            Done
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Enterprise Pagination Bar */}
      {filteredJobs.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50/40">
          <div className="text-slate-500 font-medium">
            Showing <strong className="text-slate-800">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
            <strong className="text-slate-800">{Math.min(currentPage * pageSize, filteredJobs.length)}</strong> of{' '}
            <strong className="text-slate-800">{filteredJobs.length}</strong> jobs • Page {currentPage} of {totalPages}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-[7px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all cursor-pointer shadow-2xs"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded-[7px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <ChevronLeft size={13} />
            </button>

            {visiblePages.map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`w-7 h-7 rounded-[7px] font-bold transition-all cursor-pointer ${
                  currentPage === p
                    ? 'bg-[#0000AA] text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded-[7px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <ChevronRight size={13} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded-[7px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all cursor-pointer shadow-2xs"
            >
              Last
            </button>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
