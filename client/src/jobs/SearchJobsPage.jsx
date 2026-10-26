import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Search, X, RefreshCw, Megaphone, Compass, Settings,
  ShoppingBag, Factory, Calendar, User, ArrowRight,
  Briefcase, CheckCircle2, Clock, AlertCircle, Layers
} from 'lucide-react';
import { cleanJobNo } from '../config/marketingFormConfig';

const DEPARTMENTS = [
  {
    key: 'marketing',
    name: 'Marketing',
    icon: Megaphone,
    badgeBg: 'bg-blue-50 text-blue-800 border-blue-200',
    iconBg: 'bg-blue-100 text-[#0000AA]',
    accentBorder: 'border-l-4 border-l-[#0000AA]'
  },
  {
    key: 'design',
    name: 'Design - Electrical',
    icon: Compass,
    badgeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    iconBg: 'bg-indigo-100 text-indigo-700',
    accentBorder: 'border-l-4 border-l-indigo-600'
  },
  {
    key: 'mechanical',
    name: 'Design - Mechanical',
    icon: Settings,
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
    iconBg: 'bg-slate-200 text-slate-700',
    accentBorder: 'border-l-4 border-l-slate-600'
  },
  {
    key: 'purchase',
    name: 'Procurement',
    icon: ShoppingBag,
    badgeBg: 'bg-sky-50 text-sky-800 border-sky-200',
    iconBg: 'bg-sky-100 text-sky-700',
    accentBorder: 'border-l-4 border-l-sky-600'
  },
  {
    key: 'production',
    name: 'Production & QC & Dispatch',
    icon: Factory,
    badgeBg: 'bg-blue-50 text-blue-900 border-blue-300',
    iconBg: 'bg-blue-200 text-blue-800',
    accentBorder: 'border-l-4 border-l-blue-700'
  }
];

export default function SearchJobsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const role = (user?.role || '').toLowerCase();
  const username = (user?.username || '').toLowerCase();
  const isKeval = username === 'keval v shah' || username === 'keval' || username === 'kevalvshah';
  const isAdmin = role === 'admin' || role === 'executive' || role === 'superadmin' || isKeval;

  const urlQuery = searchParams.get('search') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sync url param if provided
  useEffect(() => {
    if (urlQuery && urlQuery !== searchQuery) {
      setSearchQuery(urlQuery);
    }
  }, [urlQuery]);

  const fetchJobs = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await api.get('/jobs');
      const rawJobs = res.data?.jobs || (Array.isArray(res.data) ? res.data : []);
      setJobs(rawJobs);
    } catch (err) {
      console.error('Failed to load jobs for search:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Helper to determine which department a job currently belongs to
  const getJobDepartmentKey = (job) => {
    const cur = (job.currentDepartment || '').toLowerCase().trim();
    if (cur) {
      if (cur === 'dispatch' || cur === 'qc') return 'production';
      return cur;
    }
    const tgt = (job.targetDepartment || '').toLowerCase().trim();
    if (tgt) {
      if (tgt === 'dispatch' || tgt === 'qc') return 'production';
      return tgt;
    }
    // Check departmentStatus if available
    const statusMap = job.departmentStatus || {};
    if (statusMap.production === 'in_progress') return 'production';
    if (statusMap.purchase === 'in_progress') return 'purchase';
    if (statusMap.mechanical === 'in_progress') return 'mechanical';
    if (statusMap.design === 'in_progress') return 'design';
    return 'marketing';
  };

  // Filtered jobs by search query
  const filteredJobs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return jobs;

    return jobs.filter(j => {
      const jNo = (j.jobNo || '').toLowerCase();
      const cleanJNo = cleanJobNo(j.jobNo).toLowerCase();
      const pName = (j.projectName || '').toLowerCase();
      const cName = (j.clientName || '').toLowerCase();
      const panName = (j.panelName || '').toLowerCase();
      const engName = (j.responsibleEnggName || '').toLowerCase();
      const poNo = (j.poNo || '').toLowerCase();

      return (
        jNo.includes(q) ||
        cleanJNo.includes(q) ||
        pName.includes(q) ||
        cName.includes(q) ||
        panName.includes(q) ||
        engName.includes(q) ||
        poNo.includes(q)
      );
    });
  }, [jobs, searchQuery]);

  // Group filtered jobs by department
  const jobsByDepartment = useMemo(() => {
    const map = {
      marketing: [],
      design: [],
      mechanical: [],
      purchase: [],
      production: []
    };

    filteredJobs.forEach(job => {
      const deptKey = getJobDepartmentKey(job);
      if (map[deptKey]) {
        map[deptKey].push(job);
      } else {
        map.marketing.push(job);
      }
    });

    return map;
  }, [filteredJobs]);

  return (
    <div className="space-y-6 pb-16">
      {/* Top Filter Bar with Department Jump Pills */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {searchQuery ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-900">
                <Search size={13} className="text-[#0000AA]" />
                <span>Search results for: <strong>"{searchQuery}"</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    navigate('/search-jobs');
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded-full text-blue-700 cursor-pointer ml-1"
                  title="Clear global search"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <span className="text-xs font-bold text-slate-800">
                Master Department Jobs Directory
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 justify-between sm:justify-end w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500">
              Found <strong className="text-blue-700">{filteredJobs.length}</strong> total jobs
            </span>
            <button
              onClick={fetchJobs}
              disabled={refreshing}
              className="h-8 px-3 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-semibold transition-all cursor-pointer"
              title="Refresh Jobs"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin text-[#0000AA]' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Department Jump Filter Pills (Full Names: Design - Electrical, Design - Mechanical) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setSelectedDeptFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              selectedDeptFilter === 'all'
                ? 'bg-[#0000AA] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <span>All Departments</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${selectedDeptFilter === 'all' ? 'bg-white/20 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
              {filteredJobs.length}
            </span>
          </button>

          {DEPARTMENTS.map(d => {
            const count = (jobsByDepartment[d.key] || []).length;
            const isSelected = selectedDeptFilter === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setSelectedDeptFilter(isSelected ? 'all' : d.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#0000AA] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <span>{d.name}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DEPARTMENT SECTIONS LIST */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400 text-xs font-medium space-y-2">
          <RefreshCw size={26} className="animate-spin text-[#0000AA] mx-auto" />
          <p>Loading jobs across departments...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {DEPARTMENTS.filter(d => selectedDeptFilter === 'all' || selectedDeptFilter === d.key).map(dept => {
            const rawDeptJobs = jobsByDepartment[dept.key] || [];
            // LIFO order (latest jobs first)
            const deptJobs = [...rawDeptJobs].sort((a, b) => {
              if (b.createdAt && a.createdAt) {
                return new Date(b.createdAt) - new Date(a.createdAt);
              }
              return (Number(b.id) || 0) - (Number(a.id) || 0);
            });
            const DeptIcon = dept.icon;

            return (
              <div
                key={dept.key}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
              >
                {/* Department Section Header */}
                <div className="px-5 py-4 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl ${dept.iconBg} flex items-center justify-center font-bold shadow-2xs shrink-0`}>
                      <DeptIcon size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        {dept.name}
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${dept.badgeBg}`}>
                          {deptJobs.length} Job{deptJobs.length !== 1 ? 's' : ''}
                        </span>
                        {deptJobs.length > 6 && (
                          <span className="text-[11px] font-medium text-slate-400">
                            (Scroll for more)
                          </span>
                        )}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* Section Content: Job Cards Grid (2 rows visible initially in LIFO order, scrollable for more) */}
                <div className="p-5">
                  {deptJobs.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium">
                      No jobs currently active in {dept.name}.
                    </div>
                  ) : (
                    <div className="max-h-[425px] overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {deptJobs.map((job) => {
                          const cleanNo = cleanJobNo(job.jobNo);
                          const expDate = job.stageDueDate || job.plannedEndAt || job.deliveryDate || '—';

                        return (
                          <div
                            key={job.id}
                            onClick={() => navigate(`/jobs/${job.id}`)}
                            className={`bg-white rounded-xl border border-slate-200 p-4 hover:border-[#0000AA]/60 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between ${dept.accentBorder}`}
                          >
                            <div className="space-y-2">
                              {/* Card Header: Job No & Status */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="font-mono text-sm font-black text-blue-700 hover:text-blue-900">
                                    {cleanNo}
                                  </span>
                                  {job.projectName && (
                                    <p className="text-xs font-bold text-slate-800 line-clamp-1 mt-0.5" title={job.projectName}>
                                      {job.projectName}
                                    </p>
                                  )}
                                </div>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200/80 shrink-0">
                                  {job.lifecycleStatus || 'Active'}
                                </span>
                              </div>

                              {/* Customer & Panel Details */}
                              <div className="pt-2 border-t border-slate-100 space-y-1 text-xs">
                                <div className="flex items-center gap-1.5 text-slate-600 truncate">
                                  <Briefcase size={12} className="text-slate-400 shrink-0" />
                                  <span className="font-semibold text-slate-900 truncate">
                                    {job.clientName || 'General Customer'}
                                  </span>
                                </div>

                                {job.panelName && (
                                  <div className="flex items-center gap-1.5 text-slate-600 truncate">
                                    <Layers size={12} className="text-slate-400 shrink-0" />
                                    <span className="truncate" title={job.panelName}>
                                      {job.panelName}
                                    </span>
                                  </div>
                                )}

                                {job.responsibleEnggName && (
                                  <div className="flex items-center gap-1.5 text-slate-600 truncate">
                                    <User size={12} className="text-blue-600 shrink-0" />
                                    <span className="truncate">
                                      {job.responsibleEnggName}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Card Footer: Due Date & View Action */}
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                <Calendar size={11} className="shrink-0" />
                                <span>{expDate}</span>
                              </div>

                              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900">
                                <span>View</span>
                                <ArrowRight size={12} />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
