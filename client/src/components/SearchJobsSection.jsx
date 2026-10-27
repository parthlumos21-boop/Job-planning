import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, RefreshCw, Clock, AlertTriangle, CheckCircle2,
  ArrowRightLeft, ChevronLeft, ChevronRight, Filter, Building2, Eye
} from 'lucide-react';
import { cleanJobNo } from '../config/marketingFormConfig';

const ITEMS_PER_PAGE = 10;

const DEPARTMENT_OPTIONS = [
  { value: 'all', label: 'All Departments' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'design', label: 'Design - Electrical' },
  { value: 'mechanical', label: 'Design - Mechanical' },
  { value: 'purchase', label: 'Procurement' },
  { value: 'production', label: 'Production & QC & Dispatch' }
];

export const computeNextAction = (job) => {
  const isCompleted =
    (job.lifecycleStatus || '').toLowerCase() === 'completed' ||
    job.actualEndAt !== null ||
    (job.departmentStatus || {}).dispatch === 'completed';
  if (isCompleted) {
    return { label: 'View', badge: 'bg-slate-100 text-slate-600 border-slate-200' };
  }

  const hStatus = (job.handoverStatus || '').toLowerCase();
  const isReturned = hStatus.includes('returned') || Boolean(job.handoverReturnReason);
  if (isReturned) {
    return { label: 'Resolve Clarification', badge: 'bg-rose-50 text-rose-700 border-rose-200' };
  }

  const isHandedOver = hStatus.includes('submitted') || hStatus.includes('pending');
  if (isHandedOver) {
    return { label: 'In Review', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }

  if (job.dataGivenToDesign === 'No' || !job.dataGivenToDesign) {
    const visDepts = (job.visibleToDepartments || []).map(d => String(d).toLowerCase());
    if (visDepts.includes('marketing')) {
      return { label: 'Complete Readiness Check', badge: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
  }

  if (job.hasOpenTask) {
    return { label: 'Complete My Task', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }

  return { label: 'Handover to Next Department', badge: 'bg-teal-50 text-teal-700 border-teal-200' };
};

export default function SearchJobsSection({
  jobs = [],
  loading = false,
  onRefresh,
  isAdmin = false,
  selectedDept = 'all',
  onDeptChange,
  userDeptName = '',
  searchQuery = '',
  onSearchChange
}) {
  const navigate = useNavigate();

  const [inputVal, setInputVal] = useState(searchQuery || '');
  const [currentPage, setCurrentPage] = useState(1);

  // Debounced search sync to parent
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearchChange) {
        onSearchChange(inputVal);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputVal, onSearchChange]);

  // Keep local input in sync if parent resets search
  useEffect(() => {
    setInputVal(searchQuery || '');
  }, [searchQuery]);

  // Reset to page 1 whenever input or dept changes
  useEffect(() => {
    setCurrentPage(1);
  }, [inputVal, selectedDept]);

  // Pagination (Strictly 10 records per page)
  const totalPages = Math.max(1, Math.ceil(jobs.length / ITEMS_PER_PAGE));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return jobs.slice(start, start + ITEMS_PER_PAGE);
  }, [jobs, currentPage]);

  const handleClear = () => {
    setInputVal('');
    if (onSearchChange) {
      onSearchChange('');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 md:p-6 space-y-4">
      
      {/* 1. TOP HEADER & SEARCH BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Global Job Search
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#0000AA]/5 text-[#0000AA] border border-[#0000AA]/20">
              {jobs.length} Total Jobs
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Search across Job Number, Project, Customer, Panel, or Engineer
          </p>
        </div>

        {/* Search Input & Compact Department Filter */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 h-8 bg-[#0000AA]/5 border border-[#0000AA]/20 rounded-full text-[11.5px] font-medium text-slate-800 shrink-0">
              <Filter size={12} className="text-[#0000AA] shrink-0" />
              <select
                value={selectedDept}
                onChange={(e) => onDeptChange && onDeptChange(e.target.value)}
                className="bg-transparent text-[11.5px] font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                {DEPARTMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-white text-slate-800">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            userDeptName && (
              <div className="inline-flex items-center gap-1.5 px-2.5 h-8 bg-[#0000AA]/5 text-[#0000AA] rounded-full text-[11.5px] font-semibold border border-[#0000AA]/20 shrink-0">
                <Building2 size={12} />
                <span>{userDeptName}</span>
              </div>
            )
          )}

          {/* Compact Global Search Input with High Border Radius */}
          <div className="relative w-56 sm:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="w-full pl-8 pr-7 h-8 bg-slate-50 border border-slate-200/90 rounded-full text-[11.5px] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0000AA] focus:border-[#0000AA] transition-all font-medium text-slate-800 placeholder-slate-400"
            />
            {inputVal && (
              <button
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear Search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-all cursor-pointer shrink-0"
            title="Refresh jobs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-[#0000AA]' : ''} />
          </button>
        </div>
      </div>

      {inputVal && (
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs text-slate-500 font-medium">
            Showing results matching: <strong className="text-[#0000AA] font-bold">"{inputVal}"</strong>
          </span>
          <span className="text-xs text-slate-400">
            Found <strong>{jobs.length}</strong> matching records
          </span>
        </div>
      )}

      {/* 2. STRICTLY READ-ONLY RESULTS TABLE (EXACT 9 COLUMNS) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <RefreshCw size={26} className="animate-spin mx-auto mb-2 text-[#0000AA]" />
            Loading job records...
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#0000AA]/5 text-[#0000AA] flex items-center justify-center mx-auto mb-3">
              <Search size={22} />
            </div>
            <p className="text-sm font-bold text-slate-800">
              No jobs found. Try searching by Job Number, Project Name, Customer, Panel Name or Engineer.
            </p>
            {inputVal && (
              <button
                onClick={handleClear}
                className="mt-4 px-4 py-2 bg-[#0000AA]/5 text-[#0000AA] hover:bg-[#0000AA]/15 rounded-[7px] text-xs font-bold transition-all cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3.5 whitespace-nowrap text-slate-400 font-bold w-12 text-center">No</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Job Number</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Project Name</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Customer</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Panel Name</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Engineer</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Expected Date</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Status</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Next Action</th>
                  <th className="py-3 px-3.5 text-right whitespace-nowrap">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedJobs.map((job, idx) => {
                  const isCompleted =
                    (job.lifecycleStatus || '').toLowerCase() === 'completed' ||
                    job.actualEndAt !== null ||
                    (job.departmentStatus || {}).dispatch === 'completed';

                  const hStatus = (job.handoverStatus || '').toLowerCase();
                  const isHandedOver = hStatus.includes('submitted') || hStatus.includes('pending');
                  const isReturned = hStatus.includes('returned') || Boolean(job.handoverReturnReason);

                  const expDate = job.stageDueDate || job.plannedEndAt || job.deliveryDate;
                  let isOverdue = false;
                  if (!isCompleted && expDate) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const d = new Date(expDate);
                    if (!isNaN(d.getTime()) && d < today) isOverdue = true;
                  }

                  const nextAction = computeNextAction(job);

                  return (
                    <tr
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                    >
                      {/* 0. Sequential Number (No) */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-400 text-xs text-center font-medium">
                        {(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}
                      </td>

                      {/* 1. Job Number (Clean database number) */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-black text-[#0000AA] hover:text-[#000088] text-xs">
                        {cleanJobNo(job.jobNo)}
                      </td>

                      {/* 2. Project Name */}
                      <td className="py-3 px-3.5 text-slate-700 max-w-[170px] truncate" title={job.projectName}>
                        {job.projectName || '—'}
                      </td>

                      {/* 3. Customer */}
                      <td className="py-3 px-3.5 font-bold text-slate-900 max-w-[170px] truncate" title={job.clientName}>
                        {job.clientName || 'General Client'}
                      </td>

                      {/* 4. Panel Name */}
                      <td className="py-3 px-3.5 font-semibold text-slate-800 max-w-[170px] truncate" title={job.panelName}>
                        {job.panelName || 'Standard Panel'}
                      </td>

                      {/* 5. Engineer */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-slate-700 font-medium">
                        {job.responsibleEnggName ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            {job.responsibleEnggName}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>

                      {/* 6. Expected Date */}
                      <td className="py-3 px-3.5 text-slate-900 font-bold whitespace-nowrap">
                        {job.deliveryDate || (job.stageDueDate ? job.stageDueDate.slice(0, 10) : '') || job.plannedEndAt || '—'}
                      </td>

                      {/* 7. Status */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                            <CheckCircle2 size={11} /> Completed
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                            <AlertTriangle size={11} /> Overdue
                          </span>
                        ) : isReturned ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                            <AlertTriangle size={11} /> Returned
                          </span>
                        ) : isHandedOver ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                            <ArrowRightLeft size={11} /> In Review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                            <Clock size={11} /> In Progress
                          </span>
                        )}
                      </td>

                      {/* 8. Next Action (Clean dynamic badge) */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg border font-bold text-xs inline-flex items-center gap-1 ${nextAction.badge}`}>
                          {nextAction.label}
                        </span>
                      </td>

                      {/* 9. View Button */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/jobs/${job.id}`);
                          }}
                          className="px-3 py-1 rounded-[7px] bg-[#0000AA] hover:bg-[#000088] text-white font-bold transition-all text-xs shadow-2xs hover:shadow-xs inline-flex items-center gap-1 cursor-pointer"
                          title="View Full Job Detail"
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. STRICT 10-RECORD PAGINATION CONTROLS */}
      {jobs.length > 0 && (
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, jobs.length)}</span> of{' '}
            <span className="font-bold text-slate-800">{jobs.length}</span> entries (Page {currentPage} of {totalPages})
          </div>

          <div className="flex items-center gap-1 self-center sm:self-auto">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 transition-all cursor-pointer"
            >
              <ChevronLeft size={14} />
              Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true;
                  if (p === 1 || p === totalPages) return true;
                  if (Math.abs(p - currentPage) <= 1) return true;
                  return false;
                })
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <React.Fragment key={p}>
                      {showEllipsis && (
                        <span className="px-1 text-slate-400 font-bold">...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={`w-7 h-7 rounded-[7px] font-black transition-all cursor-pointer ${
                          currentPage === p
                            ? 'bg-[#0000AA] text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 rounded-[7px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 transition-all cursor-pointer"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
