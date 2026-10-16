import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, RefreshCw, Briefcase, Clock, AlertTriangle, CheckCircle2,
  ArrowRightLeft, ChevronLeft, ChevronRight, Filter, Building2, UserCheck
} from 'lucide-react';
import { cleanJobNo } from '../config/marketingFormConfig';

const ITEMS_PER_PAGE = 10;

const DEPARTMENT_OPTIONS = [
  { value: 'all', label: 'All Departments (Global Master)' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'design', label: 'Design - Electrical' },
  { value: 'mechanical', label: 'Design - Mechanical' },
  { value: 'purchase', label: 'Procurement' },
  { value: 'production', label: 'Production & QC & Dispatch' }
];

export default function SearchJobsSection({
  jobs = [],
  loading = false,
  onRefresh,
  isAdmin = false,
  selectedDept = 'all',
  onDeptChange,
  userDeptName = '',
  onHandoverClick
}) {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'in_progress', 'ready_for_handover', 'overdue', 'completed'
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 whenever search, statusFilter, or selectedDept changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, selectedDept]);

  // 100% Case-Insensitive 5-Field Search and Status Filtering
  const filteredJobs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return jobs.filter((job) => {
      // 5-Field Search
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const rawJobNo = (job.jobNo || '').trim().toLowerCase();
        const cleanNo = cleanJobNo(job.jobNo).toLowerCase();
        const matchesJobNo = cleanNo.includes(q) || rawJobNo.includes(q);
        const matchesProject = (job.projectName || '').toLowerCase().includes(q);
        const matchesClient = (job.clientName || '').toLowerCase().includes(q);
        const matchesPanel = (job.panelName || '').toLowerCase().includes(q);
        const matchesEngg = (job.responsibleEnggName || '').toLowerCase().includes(q);

        if (!matchesJobNo && !matchesProject && !matchesClient && !matchesPanel && !matchesEngg) {
          return false;
        }
      }

      const isCompleted =
        (job.lifecycleStatus || '').toLowerCase() === 'completed' ||
        job.actualEndAt !== null ||
        (job.departmentStatus || {}).dispatch === 'completed';

      const hStatus = (job.handoverStatus || '').toLowerCase();
      const isHandedOver = hStatus.includes('submitted') || hStatus.includes('pending');
      const isReadyForHandover = (Boolean(job.dataGivenToDesign) || isHandedOver) && !isCompleted;

      const expDate = job.stageDueDate || job.plannedEndAt || job.deliveryDate;
      let isOverdue = false;
      if (!isCompleted && expDate) {
        const d = new Date(expDate);
        if (!isNaN(d.getTime()) && d < today) {
          isOverdue = true;
        }
      }

      // Status filters
      if (statusFilter === 'in_progress') {
        if (isCompleted) return false;
      } else if (statusFilter === 'ready_for_handover') {
        if (!isReadyForHandover) return false;
      } else if (statusFilter === 'overdue') {
        if (!isOverdue) return false;
      } else if (statusFilter === 'completed') {
        if (!isCompleted) return false;
      }

      return true;
    });
  }, [jobs, search, statusFilter]);

  // Dynamic counts for status filter chips
  const statusCounts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const counts = {
      all: jobs.length,
      in_progress: 0,
      ready_for_handover: 0,
      overdue: 0,
      completed: 0
    };

    jobs.forEach((job) => {
      const isCompleted =
        (job.lifecycleStatus || '').toLowerCase() === 'completed' ||
        job.actualEndAt !== null ||
        (job.departmentStatus || {}).dispatch === 'completed';

      const hStatus = (job.handoverStatus || '').toLowerCase();
      const isHandedOver = hStatus.includes('submitted') || hStatus.includes('pending');
      const isReadyForHandover = (Boolean(job.dataGivenToDesign) || isHandedOver) && !isCompleted;

      const expDate = job.stageDueDate || job.plannedEndAt || job.deliveryDate;
      let isOverdue = false;
      if (!isCompleted && expDate) {
        const d = new Date(expDate);
        if (!isNaN(d.getTime()) && d < today) {
          isOverdue = true;
        }
      }

      if (isCompleted) counts.completed++;
      else counts.in_progress++;

      if (isReadyForHandover) counts.ready_for_handover++;
      if (isOverdue) counts.overdue++;
    });

    return counts;
  }, [jobs]);

  // Pagination (Strictly 10 records per page)
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / ITEMS_PER_PAGE));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredJobs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredJobs, currentPage]);

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden space-y-4 p-5">
      {/* Top Header & Search Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-6 rounded-full bg-blue-600 inline-block"></span>
              Search Jobs
            </h2>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all ${
                  loading ? 'animate-spin' : ''
                }`}
                title="Refresh Records"
              >
                <RefreshCw size={15} />
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {isAdmin
              ? 'Universal job register & workflow monitoring across all plant departments'
              : `${userDeptName || 'Department'} live authorized project records & stage monitoring`}
          </p>
        </div>

        {/* Right side controls: Admin Department Dropdown & Search Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Admin Department Dropdown Filter */}
          {isAdmin ? (
            <div className="flex items-center gap-2 bg-blue-50/80 px-3 py-1.5 rounded-xl border border-blue-100">
              <Filter size={14} className="text-blue-600 shrink-0" />
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wider whitespace-nowrap">
                Dept:
              </label>
              <select
                value={selectedDept}
                onChange={(e) => onDeptChange && onDeptChange(e.target.value)}
                className="bg-transparent text-xs font-bold text-blue-900 focus:outline-none cursor-pointer"
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
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold border border-blue-100 shrink-0">
                <Building2 size={13} />
                <span>{userDeptName}</span>
              </div>
            )
          )}

          {/* 5-Field Search Box */}
          <div className="relative min-w-[260px] sm:w-80">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Job No, Project, Customer, Panel, Engineer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="Clear Search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
        {[
          { id: 'all', label: 'All Jobs', count: statusCounts.all },
          { id: 'in_progress', label: 'In Progress', count: statusCounts.in_progress },
          { id: 'ready_for_handover', label: 'Ready for Next Stage', count: statusCounts.ready_for_handover },
          { id: 'overdue', label: 'Overdue', count: statusCounts.overdue },
          { id: 'completed', label: 'Completed', count: statusCounts.completed }
        ].map((chip) => (
          <button
            key={chip.id}
            onClick={() => setStatusFilter(chip.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              statusFilter === chip.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <span>{chip.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                statusFilter === chip.id
                  ? 'bg-white/20 text-white'
                  : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              {chip.count}
            </span>
          </button>
        ))}

        {search && (
          <span className="text-xs text-slate-500 ml-auto whitespace-nowrap font-medium">
            Found <strong className="text-blue-600">{filteredJobs.length}</strong> matching records
          </span>
        )}
      </div>

      {/* Results Table (Exact 9 Columns from Visual Reference) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <RefreshCw size={26} className="animate-spin mx-auto mb-2 text-blue-600" />
            Loading live job records...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mx-auto mb-3">
              <Search size={22} />
            </div>
            <p className="text-sm font-bold text-slate-800">No matching jobs found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {search
                ? `No jobs match "${search}" with the active status filter.`
                : 'No jobs are currently registered in this filter category.'}
            </p>
            {(search || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setStatusFilter('all'); }}
                className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all"
              >
                Clear Search & Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3.5 whitespace-nowrap">Job Number</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Project Name</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Customer</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Panel Name</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Engineer</th>
                  <th className="py-3 px-3 whitespace-nowrap">Expected Date</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Status</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Next Action</th>
                  <th className="py-3 px-3.5 text-right whitespace-nowrap">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedJobs.map((job) => {
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

                  return (
                    <tr key={job.id} className="hover:bg-blue-50/40 transition-colors">
                      {/* 1. Job Number (Clean without #) */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="font-black text-blue-700 hover:text-blue-900 hover:underline text-xs flex items-center gap-1"
                          title="Open Job Details"
                        >
                          {cleanJobNo(job.jobNo)}
                        </button>
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
                      <td className="py-3 px-3 text-slate-900 font-bold whitespace-nowrap">
                        {job.deliveryDate || (job.stageDueDate ? job.stageDueDate.slice(0, 10) : '—')}
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

                      {/* 8. Next Action */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {!isCompleted && onHandoverClick && !isHandedOver ? (
                          <button
                            onClick={() => onHandoverClick(job)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold transition-all text-xs flex items-center gap-1"
                            title="Handover Job to Next Department"
                          >
                            <ArrowRightLeft size={11} />
                            Handover →
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/jobs/edit/${job.id}`)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold transition-all text-xs"
                            title="Update Job Data"
                          >
                            Update
                          </button>
                        )}
                      </td>

                      {/* 9. View */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all text-xs shadow-2xs hover:shadow-xs"
                          title="View Full Job Detail"
                        >
                          Open
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

      {/* Strict 10-Record Pagination Controls */}
      {filteredJobs.length > 0 && (
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, filteredJobs.length)}</span> of{' '}
            <span className="font-bold text-slate-800">{filteredJobs.length}</span> entries (Page {currentPage} of {totalPages})
          </div>

          <div className="flex items-center gap-1 self-center sm:self-auto">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 transition-all"
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
                        className={`w-7 h-7 rounded-lg font-black transition-all ${
                          currentPage === p
                            ? 'bg-blue-600 text-white shadow-xs'
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
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold flex items-center gap-1 transition-all"
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
