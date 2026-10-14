import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  ShieldCheck, AlertTriangle, Clock, RefreshCw, CheckCircle2,
  Users, UserCheck, ArrowRightLeft, Layers, Calendar, Search,
  ChevronRight, Filter, AlertCircle, TrendingUp, TrendingDown,
  Building2, FileText, Activity, HelpCircle, Check, X, ArrowUpRight,
  Loader2, SlidersHorizontal, BarChart3, Briefcase, Eye, ChevronDown,
  Info, History, CheckSquare, Settings2, Sparkles
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, Cell
} from 'recharts';

const DELAY_CATEGORIES = [
  "Pending information from customer",
  "Pending input from another department",
  "Technical clarification required",
  "Design work pending",
  "Material or procurement delay",
  "Resource or workload constraint",
  "Approval pending",
  "Job assignment or ownership issue",
  "Scope or specification change",
  "Incorrect or incomplete information",
  "Unexpected technical issue",
  "Other — explanation required"
];

const REASSIGNMENT_REASONS = [
  "Workload balancing",
  "Previous owner unavailable",
  "Department changed",
  "Required expertise",
  "Priority changed",
  "Incorrect original assignment",
  "Project requirement changed",
  "Management decision",
  "Employee unavailable",
  "Other"
];

export default function AdminOversightDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Primary Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Backend Datasets
  const [kpis, setKpis] = useState(null);
  const [monitorItems, setMonitorItems] = useState([]);
  const [liveWorkingData, setLiveWorkingData] = useState([]);
  const [customerWork, setCustomerWork] = useState([]);
  const [delayData, setDelayData] = useState({ delayedJobs: [], categoryBreakdown: [] });
  const [assignmentChanges, setAssignmentChanges] = useState([]);
  const [userAccountability, setUserAccountability] = useState([]);

  // 11 Filter Controls State
  const [filters, setFilters] = useState({
    search: '',
    department: 'all',
    customer: 'all',
    workerId: '',
    planningOwnerId: '',
    jobStatus: 'all',
    delayStatus: 'all',
    priority: 'all',
    dateFrom: '',
    dateTo: ''
  });

  // Active KPI Card filter
  const [activeKpiFilter, setActiveKpiFilter] = useState(null);

  // Column Settings (Show/Hide Table Columns)
  const [columnVisibility, setColumnVisibility] = useState({
    jobNo: true,
    customer: true,
    project: true,
    panel: true,
    currentStage: true,
    department: true,
    workingBy: true,
    planningOwner: true,
    assignedDate: false,
    expectedStart: false,
    originalExpected: true,
    currentExpected: true,
    todayStatus: true,
    daysLateEarly: true,
    lateReason: true,
    reasonReportedBy: true,
    reasonDate: false,
    actualCompletion: true,
    completionVariance: true,
    lastActivity: true
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Complete Job Accountability Drawer
  const [selectedJobDrawer, setSelectedJobDrawer] = useState(null);

  // Review Drawer State
  const [reviewModal, setReviewModal] = useState({
    isOpen: false,
    job: null,
    action: 'REVIEW',
    notes: '',
    correctiveAction: '',
    reasonCategory: '',
    submitting: false,
    error: '',
    success: ''
  });

  // Deadline Revision Modal State
  const [revisionModal, setRevisionModal] = useState({
    isOpen: false,
    job: null,
    newDate: '',
    reasonCategory: DELAY_CATEGORIES[0],
    rationale: '',
    submitting: false,
    error: '',
    success: ''
  });

  // Load All Admin Data
  const fetchAllAdminData = async () => {
    try {
      setRefreshing(true);
      const [kpiRes, monitorRes, liveRes, custRes, delayRes, assignRes, accountRes] = await Promise.all([
        api.get('/admin/dashboard/kpis'),
        api.get('/admin/dashboard/accountability-monitor'),
        api.get('/admin/dashboard/live-working-metrics'),
        api.get('/admin/dashboard/customer-work'),
        api.get('/admin/dashboard/delay-investigation'),
        api.get('/admin/dashboard/assignment-changes'),
        api.get('/admin/dashboard/user-accountability')
      ]);

      setKpis(kpiRes.data);
      setMonitorItems(monitorRes.data?.items || []);
      setLiveWorkingData(liveRes.data || []);
      setCustomerWork(custRes.data || []);
      setDelayData(delayRes.data || { delayedJobs: [], categoryBreakdown: [] });
      setAssignmentChanges(assignRes.data || []);
      setUserAccountability(accountRes.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllAdminData();
    const interval = setInterval(fetchAllAdminData, 60000); // 60s live auto-refresh
    return () => clearInterval(interval);
  }, []);

  // Filter Monitor Items
  const filteredJobs = useMemo(() => {
    let list = monitorItems;

    // KPI Card Filter Pre-Filter
    if (activeKpiFilter) {
      if (activeKpiFilter === 'totalActiveJobs') {
        list = list.filter(j => j.todayStatus !== 'COMPLETED');
      } else if (activeKpiFilter === 'onTimeJobs') {
        list = list.filter(j => j.todayStatus === 'ON_TIME');
      } else if (activeKpiFilter === 'atRiskJobs') {
        list = list.filter(j => j.todayStatus === 'AT_RISK');
      } else if (activeKpiFilter === 'overdueJobs') {
        list = list.filter(j => j.todayStatus === 'OVERDUE');
      } else if (activeKpiFilter === 'withDelayReason') {
        list = list.filter(j => j.todayStatus === 'OVERDUE' && j.lateReason && j.lateReason !== 'Reason Pending' && j.lateReason !== '—');
      } else if (activeKpiFilter === 'missingDelayReason') {
        list = list.filter(j => j.todayStatus === 'OVERDUE' && (!j.lateReason || j.lateReason === 'Reason Pending'));
      } else if (activeKpiFilter === 'reassignedJobs') {
        list = list.filter(j => j.reassignmentsCount > 0);
      } else if (activeKpiFilter === 'revisedExpectedDate') {
        list = list.filter(j => j.revisionsCount > 0);
      } else if (activeKpiFilter === 'completedJobs') {
        list = list.filter(j => j.todayStatus === 'COMPLETED');
      } else if (activeKpiFilter === 'completedLate') {
        list = list.filter(j => j.todayStatus === 'COMPLETED' && j.daysVariance > 0);
      } else if (activeKpiFilter === 'completedOnTime') {
        list = list.filter(j => j.todayStatus === 'COMPLETED' && j.daysVariance <= 0);
      } else if (activeKpiFilter === 'completedEarly') {
        list = list.filter(j => j.todayStatus === 'COMPLETED' && j.daysVariance < 0);
      }
    }

    // Header Controls Filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(j =>
        (j.jobNo || '').toLowerCase().includes(q) ||
        (j.clientName || '').toLowerCase().includes(q) ||
        (j.projectName || '').toLowerCase().includes(q) ||
        (j.panelName || '').toLowerCase().includes(q) ||
        (j.workingBy?.name || '').toLowerCase().includes(q) ||
        (j.planningOwnerName || '').toLowerCase().includes(q)
      );
    }
    if (filters.department !== 'all') {
      list = list.filter(j => (j.department || '').toLowerCase() === filters.department.toLowerCase());
    }
    if (filters.customer !== 'all') {
      list = list.filter(j => (j.clientName || '').toLowerCase() === filters.customer.toLowerCase());
    }
    if (filters.priority !== 'all') {
      list = list.filter(j => (j.priority || '').toLowerCase() === filters.priority.toLowerCase());
    }
    if (filters.delayStatus !== 'all') {
      list = list.filter(j => j.todayStatus === filters.delayStatus.toUpperCase());
    }
    if (filters.jobStatus !== 'all') {
      if (filters.jobStatus === 'active') list = list.filter(j => j.todayStatus !== 'COMPLETED');
      if (filters.jobStatus === 'completed') list = list.filter(j => j.todayStatus === 'COMPLETED');
    }

    return list;
  }, [monitorItems, activeKpiFilter, filters]);

  // Unique lists for dropdowns
  const uniqueCustomers = useMemo(() => {
    const set = new Set();
    monitorItems.forEach(j => { if (j.clientName) set.add(j.clientName); });
    return Array.from(set).sort();
  }, [monitorItems]);

  const uniqueDepartments = useMemo(() => {
    const set = new Set();
    monitorItems.forEach(j => { if (j.department) set.add(j.department); });
    return Array.from(set).sort();
  }, [monitorItems]);

  // Top 12 Active KPI Cards Definition
  const TOP_12_KPIS = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        id: 'totalActiveJobs',
        title: 'Total Active Jobs',
        subtitle: 'In pipeline',
        count: kpis.totalActiveJobs ?? (kpis.totalJobs - (kpis.completedJobs || 0)),
        icon: <Layers size={18} className="text-slate-700" />,
        theme: 'border-slate-200 bg-white hover:border-slate-400 text-slate-900',
        activeTheme: 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/30'
      },
      {
        id: 'onTimeJobs',
        title: 'On-Time Jobs',
        subtitle: 'On schedule',
        count: kpis.onTimeJobs ?? 0,
        icon: <CheckCircle2 size={18} className="text-emerald-600" />,
        theme: 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 text-emerald-900',
        activeTheme: 'border-emerald-600 bg-emerald-100 ring-2 ring-emerald-500/30'
      },
      {
        id: 'atRiskJobs',
        title: 'At-Risk Jobs',
        subtitle: 'Due in ≤48h',
        count: kpis.atRiskJobs ?? 0,
        icon: <Clock size={18} className="text-amber-600" />,
        theme: 'border-amber-200 bg-amber-50/50 hover:border-amber-400 text-amber-900',
        activeTheme: 'border-amber-600 bg-amber-100 ring-2 ring-amber-500/30'
      },
      {
        id: 'overdueJobs',
        title: 'Overdue ("Job Late")',
        subtitle: 'Past target date',
        count: kpis.overdueJobs ?? 0,
        icon: <AlertTriangle size={18} className="text-rose-600" />,
        theme: 'border-rose-300 bg-rose-50/70 hover:border-rose-400 text-rose-950',
        activeTheme: 'border-rose-600 bg-rose-100 ring-2 ring-rose-500/30'
      },
      {
        id: 'withDelayReason',
        title: 'With Delay Reason',
        subtitle: 'Explanation recorded',
        count: kpis.jobsWithDelayReason ?? 0,
        icon: <FileText size={18} className="text-blue-600" />,
        theme: 'border-blue-200 bg-blue-50/50 hover:border-blue-400 text-blue-900',
        activeTheme: 'border-blue-600 bg-blue-100 ring-2 ring-blue-500/30'
      },
      {
        id: 'missingDelayReason',
        title: 'Reason Missing',
        subtitle: 'Needs explanation',
        count: kpis.jobsWithoutDelayReason ?? 0,
        icon: <AlertCircle size={18} className="text-orange-600" />,
        theme: 'border-orange-300 bg-orange-50/70 hover:border-orange-400 text-orange-950',
        activeTheme: 'border-orange-600 bg-orange-100 ring-2 ring-orange-500/30'
      },
      {
        id: 'reassignedJobs',
        title: 'Reassigned Jobs',
        subtitle: 'Transferred owner',
        count: kpis.jobsReassigned ?? 0,
        icon: <ArrowRightLeft size={18} className="text-purple-600" />,
        theme: 'border-purple-200 bg-purple-50/50 hover:border-purple-400 text-purple-900',
        activeTheme: 'border-purple-600 bg-purple-100 ring-2 ring-purple-500/30'
      },
      {
        id: 'revisedExpectedDate',
        title: 'Revised Date',
        subtitle: 'Approved revisions',
        count: kpis.jobsWithRevisedExpectedDate ?? 0,
        icon: <Calendar size={18} className="text-cyan-600" />,
        theme: 'border-cyan-200 bg-cyan-50/50 hover:border-cyan-400 text-cyan-900',
        activeTheme: 'border-cyan-600 bg-cyan-100 ring-2 ring-cyan-500/30'
      },
      {
        id: 'completedJobs',
        title: 'Completed Jobs',
        subtitle: 'Released / Done',
        count: kpis.completedJobs ?? 0,
        icon: <ShieldCheck size={18} className="text-teal-600" />,
        theme: 'border-teal-200 bg-teal-50/50 hover:border-teal-400 text-teal-900',
        activeTheme: 'border-teal-600 bg-teal-100 ring-2 ring-teal-500/30'
      },
      {
        id: 'completedLate',
        title: 'Completed Late',
        subtitle: 'Over original commit',
        count: kpis.completedLate ?? 0,
        icon: <TrendingDown size={18} className="text-rose-600" />,
        theme: 'border-rose-200 bg-rose-50/40 hover:border-rose-300 text-rose-900',
        activeTheme: 'border-rose-600 bg-rose-100 ring-2 ring-rose-500/30'
      },
      {
        id: 'completedOnTime',
        title: 'Completed On Time',
        subtitle: 'Met commitment',
        count: kpis.completedOnTime ?? 0,
        icon: <Check size={18} className="text-green-600" />,
        theme: 'border-green-200 bg-green-50/50 hover:border-green-400 text-green-900',
        activeTheme: 'border-green-600 bg-green-100 ring-2 ring-green-500/30'
      },
      {
        id: 'completedEarly',
        title: 'Completed Early',
        subtitle: 'Ahead of target',
        count: kpis.completedEarly ?? 0,
        icon: <TrendingUp size={18} className="text-indigo-600" />,
        theme: 'border-indigo-200 bg-indigo-50/50 hover:border-indigo-400 text-indigo-900',
        activeTheme: 'border-indigo-600 bg-indigo-100 ring-2 ring-indigo-500/30'
      }
    ];
  }, [kpis]);

  // Submit Delay Review
  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!reviewModal.job) return;
    try {
      setReviewModal(prev => ({ ...prev, submitting: true, error: '', success: '' }));
      await api.post(`/admin/dashboard/jobs/${reviewModal.job.jobId || reviewModal.job.id}/delay-review`, {
        action: reviewModal.action,
        adminReviewNotes: reviewModal.notes,
        correctiveActionRequired: reviewModal.correctiveAction,
        reasonCategory: reviewModal.reasonCategory || undefined
      });
      setReviewModal(prev => ({ ...prev, success: 'Delay review recorded successfully!' }));
      setTimeout(() => {
        setReviewModal({ isOpen: false, job: null, action: 'REVIEW', notes: '', correctiveAction: '', reasonCategory: '', submitting: false, error: '', success: '' });
        fetchAllAdminData();
      }, 1000);
    } catch (err) {
      setReviewModal(prev => ({ ...prev, submitting: false, error: err.response?.data?.detail || 'Failed to submit delay review' }));
    }
  };

  // Submit Deadline Revision
  const handleSubmitRevision = async (e) => {
    e.preventDefault();
    if (!revisionModal.job) return;
    if (!revisionModal.newDate) {
      setRevisionModal(prev => ({ ...prev, error: 'Please choose a revised target date' }));
      return;
    }
    if (!revisionModal.rationale || revisionModal.rationale.trim().length < 5) {
      setRevisionModal(prev => ({ ...prev, error: 'Mandatory rationale must be at least 5 characters' }));
      return;
    }

    try {
      setRevisionModal(prev => ({ ...prev, submitting: true, error: '', success: '' }));
      await api.post(`/admin/dashboard/jobs/${revisionModal.job.jobId || revisionModal.job.id}/approve-deadline-revision`, {
        newTargetDate: revisionModal.newDate,
        reasonCategory: revisionModal.reasonCategory,
        revisionRationale: revisionModal.rationale.trim()
      });
      setRevisionModal(prev => ({ ...prev, success: 'Target deadline revised and audit log generated!' }));
      setTimeout(() => {
        setRevisionModal({ isOpen: false, job: null, newDate: '', reasonCategory: DELAY_CATEGORIES[0], rationale: '', submitting: false, error: '', success: '' });
        fetchAllAdminData();
      }, 1000);
    } catch (err) {
      setRevisionModal(prev => ({ ...prev, submitting: false, error: err.response?.data?.detail || 'Failed to revise deadline' }));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={36} className="animate-spin text-indigo-600" />
        <span className="text-sm font-semibold text-slate-600">Loading Admin Oversight & Accountability Command Center...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-16">
      
      {/* 1. COMMAND CENTER HEADER */}
      <div className="bg-white/95 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-800 text-white shadow-md shadow-indigo-950/20">
              <ShieldCheck size={30} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Admin Oversight & Accountability Command Center
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  Job Late for Users
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Strictly Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                Monitor job ownership, planned dates, delays, reasons, revised commitments and actual completion performance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Live Database Sync</span>
              <span className="text-xs font-semibold text-slate-700">
                Last Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <button
              onClick={fetchAllAdminData}
              disabled={refreshing}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-white' : 'text-slate-300'} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* 11 Filter Controls Bar */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
          {/* Search */}
          <div className="col-span-2 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Job #, Project, Customer, Worker..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 placeholder-slate-400"
            />
            {filters.search && (
              <button
                onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Department */}
          <div>
            <select
              value={filters.department}
              onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 capitalize"
            >
              <option value="all">Dept: All</option>
              {uniqueDepartments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Customer */}
          <div>
            <select
              value={filters.customer}
              onChange={(e) => setFilters(prev => ({ ...prev, customer: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 truncate"
            >
              <option value="all">Customer: All</option>
              {uniqueCustomers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Delay Status */}
          <div>
            <select
              value={filters.delayStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, delayStatus: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
            >
              <option value="all">Delay: All</option>
              <option value="ON_TIME">On Time</option>
              <option value="AT_RISK">At Risk</option>
              <option value="OVERDUE">Overdue (Late)</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          {/* Job Status */}
          <div>
            <select
              value={filters.jobStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, jobStatus: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
            >
              <option value="all">Status: All</option>
              <option value="active">Active Only</option>
              <option value="completed">Completed Only</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <select
              value={filters.priority}
              onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
            >
              <option value="all">Priority: All</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>

          {/* Reset Filters Button */}
          <div className="flex items-center gap-2">
            {(filters.search || filters.department !== 'all' || filters.customer !== 'all' || filters.delayStatus !== 'all' || filters.jobStatus !== 'all' || filters.priority !== 'all' || activeKpiFilter) && (
              <button
                onClick={() => {
                  setFilters({
                    search: '',
                    department: 'all',
                    customer: 'all',
                    workerId: '',
                    planningOwnerId: '',
                    jobStatus: 'all',
                    delayStatus: 'all',
                    priority: 'all',
                    dateFrom: '',
                    dateTo: ''
                  });
                  setActiveKpiFilter(null);
                }}
                className="w-full py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                <X size={12} />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. TOP 12 ACTIVE KPI CARDS */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-indigo-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Operational Accountability KPI Matrix (12 Interactive Live Indicators)
            </h2>
          </div>
          {activeKpiFilter && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1">
              <span>Filtering table by: <strong>{activeKpiFilter}</strong></span>
              <button onClick={() => setActiveKpiFilter(null)} className="hover:text-rose-600"><X size={12} /></button>
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {TOP_12_KPIS.map(card => {
            const isActive = activeKpiFilter === card.id;
            return (
              <div
                key={card.id}
                onClick={() => setActiveKpiFilter(isActive ? null : card.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                  isActive ? card.activeTheme : card.theme
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold leading-tight">{card.title}</span>
                  {card.icon}
                </div>
                <div>
                  <div className="text-2xl font-black tracking-tight">{card.count}</div>
                  <div className="text-[10px] text-slate-500 font-medium truncate">{card.subtitle}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. ROW 3: DUAL LIVE WORKING & DELAY INTELLIGENCE CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart A: Live Active Work in Progress vs Expected Duration */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Live Active Work Duration vs Expected Budget (Hours)
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Real-time active work duration for currently running jobs tracked by worker.
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {liveWorkingData.length} Live
            </span>
          </div>

          {liveWorkingData.length === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Clock size={28} className="mb-2 text-slate-300" />
              <span>No active jobs currently running timers.</span>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={liveWorkingData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                >
                  <XAxis type="number" unit="h" tick={{ fontSize: 10 }} />
                  <YAxis
                    dataKey="jobNo"
                    type="category"
                    tick={{ fontSize: 11, fontWeight: 600 }}
                    width={70}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs shadow-lg space-y-1">
                            <div className="font-bold text-amber-400">Job #{data.jobNo} — {data.clientName}</div>
                            <div>Worker: <strong className="text-white">{data.workerName}</strong> ({data.department})</div>
                            <div>Active Hours: <strong className="text-emerald-400">{data.activeHours}h</strong></div>
                            <div>Expected Budget: <strong className="text-blue-300">{data.expectedHours}h</strong></div>
                            <div>Variance: <strong className={data.varianceHours > 0 ? 'text-rose-400' : 'text-emerald-400'}>{data.varianceHours > 0 ? `+${data.varianceHours}h Late` : `${data.varianceHours}h`}</strong></div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                  <Bar dataKey="activeHours" name="Active Worked (h)" fill="#6366f1" radius={[0, 4, 4, 0]}>
                    {liveWorkingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isOverBudget ? '#ef4444' : '#6366f1'} />
                    ))}
                  </Bar>
                  <Bar dataKey="expectedHours" name="Expected Budget (h)" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart B: Live Delay Reasons Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Why Are Jobs Late? (Live Reason Distribution)
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Click any delay reason bar to filter the Accountability Table below.
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              {delayData.totalDelayed || 0} Delayed
            </span>
          </div>

          {(!delayData.categoryBreakdown || delayData.categoryBreakdown.length === 0) ? (
            <div className="h-60 flex flex-col items-center justify-center text-slate-400 text-xs">
              <CheckCircle2 size={28} className="mb-2 text-emerald-400" />
              <span>No delayed jobs recorded currently.</span>
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={delayData.categoryBreakdown}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    dataKey="category"
                    type="category"
                    tick={{ fontSize: 10 }}
                    width={130}
                    tickFormatter={(val) => val.length > 20 ? `${val.substring(0, 18)}...` : val}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs shadow-lg space-y-1">
                            <div className="font-bold text-amber-400">{data.category}</div>
                            <div>Delayed Jobs: <strong>{data.count}</strong></div>
                            <div className="text-[10px] text-slate-400">Click to filter table below</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Affected Jobs"
                    fill="#f43f5e"
                    radius={[0, 4, 4, 0]}
                    onClick={(entry) => {
                      if (entry?.category) {
                        setFilters(prev => ({ ...prev, search: entry.category, delayStatus: 'OVERDUE' }));
                      }
                    }}
                    cursor="pointer"
                  >
                    {delayData.categoryBreakdown.map((entry, index) => (
                      <Cell key={`delay-cell-${index}`} fill={entry.category === 'Reason Not Recorded' ? '#f97316' : '#f43f5e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>

      {/* 4. MAIN ACCOUNTABILITY & DELAY MONITOR TABLE (20 COLUMNS) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
          <div>
            <div className="flex items-center gap-2">
              <Briefcase size={16} className="text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Job Accountability & Delay Monitor ({filteredJobs.length} Jobs)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live operational register: Immutable original commitments vs. current expected dates, responsible users, and delay reasons.
            </p>
          </div>

          {/* Column Settings Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer transition-all"
            >
              <Settings2 size={13} className="text-slate-500" />
              <span>Column Settings</span>
              <ChevronDown size={12} className={showColumnSettings ? 'rotate-180 text-indigo-600' : 'text-slate-400'} />
            </button>

            {showColumnSettings && (
              <div className="absolute right-0 top-9 w-64 p-3 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 space-y-2 text-xs">
                <div className="font-bold text-slate-800 pb-1 border-b border-slate-100 flex items-center justify-between">
                  <span>Show / Hide Columns</span>
                  <button onClick={() => setShowColumnSettings(false)} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
                  {Object.keys(columnVisibility).map(col => (
                    <label key={col} className="flex items-center gap-1.5 text-slate-700 cursor-pointer text-[11px] capitalize">
                      <input
                        type="checkbox"
                        checked={columnVisibility[col]}
                        onChange={(e) => setColumnVisibility(prev => ({ ...prev, [col]: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{col.replace(/([A-Z])/g, ' $1')}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider whitespace-nowrap">
                {columnVisibility.jobNo && <th className="py-3 px-3">Job No</th>}
                {columnVisibility.customer && <th className="py-3 px-3">Customer</th>}
                {columnVisibility.project && <th className="py-3 px-3">Project</th>}
                {columnVisibility.panel && <th className="py-3 px-3">Panel</th>}
                {columnVisibility.currentStage && <th className="py-3 px-3">Current Stage</th>}
                {columnVisibility.department && <th className="py-3 px-3">Department</th>}
                {columnVisibility.workingBy && <th className="py-3 px-3 min-w-[180px]">Working By (Current Responsibility)</th>}
                {columnVisibility.planningOwner && <th className="py-3 px-3">Planning Owner</th>}
                {columnVisibility.assignedDate && <th className="py-3 px-3">Assigned Date</th>}
                {columnVisibility.expectedStart && <th className="py-3 px-3">Expected Start</th>}
                {columnVisibility.originalExpected && <th className="py-3 px-3 font-black text-slate-800">Original Expected Date</th>}
                {columnVisibility.currentExpected && <th className="py-3 px-3 font-black text-indigo-700">Current Expected Date</th>}
                {columnVisibility.todayStatus && <th className="py-3 px-3">Today Status</th>}
                {columnVisibility.daysLateEarly && <th className="py-3 px-3">Days Variance</th>}
                {columnVisibility.lateReason && <th className="py-3 px-3 min-w-[160px]">Why Late?</th>}
                {columnVisibility.reasonReportedBy && <th className="py-3 px-3">Reported By</th>}
                {columnVisibility.reasonDate && <th className="py-3 px-3">Reason Date</th>}
                {columnVisibility.actualCompletion && <th className="py-3 px-3">Actual Completion</th>}
                {columnVisibility.completionVariance && <th className="py-3 px-3">Variance</th>}
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={20} className="py-12 text-center text-slate-400">
                    <AlertCircle size={28} className="mx-auto mb-2 text-slate-300" />
                    <span>No jobs match your selected filter criteria.</span>
                  </td>
                </tr>
              ) : (
                filteredJobs.map(job => {
                  const isLate = job.todayStatus === 'OVERDUE';
                  const isAtRisk = job.todayStatus === 'AT_RISK';
                  const isDone = job.todayStatus === 'COMPLETED';

                  return (
                    <tr
                      key={job.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isLate ? 'bg-rose-50/25' : isAtRisk ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      {/* Job No */}
                      {columnVisibility.jobNo && (
                        <td className="py-3 px-3 font-black text-indigo-600 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedJobDrawer(job)}
                            className="hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>#{job.jobNo}</span>
                            <Eye size={12} className="text-slate-400" />
                          </button>
                        </td>
                      )}

                      {/* Customer */}
                      {columnVisibility.customer && (
                        <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                          {job.clientName}
                        </td>
                      )}

                      {/* Project */}
                      {columnVisibility.project && (
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          {job.projectName}
                        </td>
                      )}

                      {/* Panel */}
                      {columnVisibility.panel && (
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          {job.panelName}
                        </td>
                      )}

                      {/* Current Stage */}
                      {columnVisibility.currentStage && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {job.currentStage}
                          </span>
                        </td>
                      )}

                      {/* Department */}
                      {columnVisibility.department && (
                        <td className="py-3 px-3 text-slate-600 capitalize whitespace-nowrap">
                          {job.department}
                        </td>
                      )}

                      {/* Working By (Section 5 Spec) */}
                      {columnVisibility.workingBy && (
                        <td className="py-3 px-3">
                          <div className="bg-white/80 p-2 rounded-xl border border-slate-200 shadow-2xs space-y-0.5">
                            <div className="font-bold text-slate-900 flex items-center justify-between">
                              <span>{job.workingBy?.name || 'Unassigned'}</span>
                              <span className="text-[9px] text-slate-400 font-normal">
                                {job.workingBy?.timeWithOwnerHours ? `${job.workingBy.timeWithOwnerHours}h with owner` : ''}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              {job.workingBy?.department} • {job.workingBy?.role}
                            </div>
                            {job.workingBy?.assignedAt && (
                              <div className="text-[9px] text-slate-400">
                                Assigned: {new Date(job.workingBy.assignedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Planning Owner */}
                      {columnVisibility.planningOwner && (
                        <td className="py-3 px-3 text-slate-700 font-medium whitespace-nowrap">
                          {job.planningOwnerName}
                        </td>
                      )}

                      {/* Assigned Date */}
                      {columnVisibility.assignedDate && (
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {job.assignedDate ? new Date(job.assignedDate).toLocaleDateString() : '—'}
                        </td>
                      )}

                      {/* Expected Start */}
                      {columnVisibility.expectedStart && (
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {job.expectedStart ? new Date(job.expectedStart).toLocaleDateString() : '—'}
                        </td>
                      )}

                      {/* Original Expected Date (Section 6 Spec: NEVER OVERWRITTEN) */}
                      {columnVisibility.originalExpected && (
                        <td className="py-3 px-3 font-bold text-slate-800 whitespace-nowrap">
                          {job.originalExpectedDate ? new Date(job.originalExpectedDate).toLocaleDateString() : '—'}
                        </td>
                      )}

                      {/* Current Expected Date */}
                      {columnVisibility.currentExpected && (
                        <td className="py-3 px-3 font-bold text-indigo-700 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{job.currentExpectedDate ? new Date(job.currentExpectedDate).toLocaleDateString() : '—'}</span>
                            {job.revisionsCount > 0 && (
                              <span className="px-1 py-0.2 rounded text-[9px] bg-cyan-100 text-cyan-800 font-bold" title="Revised date">
                                Rev ({job.revisionsCount})
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Today Status */}
                      {columnVisibility.todayStatus && (
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide ${
                            isDone ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            isLate ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                            isAtRisk ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                            'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}>
                            {job.todayStatus}
                          </span>
                        </td>
                      )}

                      {/* Days Early/Late Variance */}
                      {columnVisibility.daysLateEarly && (
                        <td className="py-3 px-3 font-bold whitespace-nowrap">
                          {isDone ? (
                            <span className={job.daysVariance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {job.daysVariance > 0 ? `+${job.daysVariance}d Late` : `${job.daysVariance}d Early`}
                            </span>
                          ) : isLate ? (
                            <span className="text-rose-700 font-black">+{job.daysVariance}d Overdue</span>
                          ) : isAtRisk ? (
                            <span className="text-amber-700">Due Soon</span>
                          ) : (
                            <span className="text-emerald-700">On Schedule</span>
                          )}
                        </td>
                      )}

                      {/* Late Reason (Section 8 Spec) */}
                      {columnVisibility.lateReason && (
                        <td className="py-3 px-3">
                          {isLate ? (
                            <div className="space-y-0.5">
                              <span className={`font-bold text-[11px] block ${
                                job.lateReason === 'Reason Pending' ? 'text-orange-600 italic' : 'text-slate-800'
                              }`}>
                                {job.lateReason}
                              </span>
                              {job.detailedExplanation && (
                                <p className="text-[10px] text-slate-500 line-clamp-1" title={job.detailedExplanation}>
                                  {job.detailedExplanation}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      {/* Reason Reported By */}
                      {columnVisibility.reasonReportedBy && (
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          {job.reasonReportedBy || '—'}
                        </td>
                      )}

                      {/* Reason Date */}
                      {columnVisibility.reasonDate && (
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {job.reasonDate ? new Date(job.reasonDate).toLocaleDateString() : '—'}
                        </td>
                      )}

                      {/* Actual Completion */}
                      {columnVisibility.actualCompletion && (
                        <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                          {job.actualCompletionDate ? new Date(job.actualCompletionDate).toLocaleDateString() : '—'}
                        </td>
                      )}

                      {/* Completion Variance */}
                      {columnVisibility.completionVariance && (
                        <td className="py-3 px-3 font-semibold whitespace-nowrap">
                          {job.completionVariance}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedJobDrawer(job)}
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="Inspect Complete Job Story"
                          >
                            <Eye size={14} />
                          </button>
                          {isLate && (
                            <button
                              onClick={() => setReviewModal({
                                isOpen: true,
                                job: job,
                                action: 'REVIEW',
                                notes: job.adminReviewNotes || '',
                                correctiveAction: job.correctiveAction || '',
                                reasonCategory: job.lateReason !== 'Reason Pending' ? job.lateReason : DELAY_CATEGORIES[0],
                                submitting: false,
                                error: '',
                                success: ''
                              })}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[10px] font-bold cursor-pointer"
                              title="Review Delay"
                            >
                              Review
                            </button>
                          )}
                          <button
                            onClick={() => setRevisionModal({
                              isOpen: true,
                              job: job,
                              newDate: '',
                              reasonCategory: DELAY_CATEGORIES[0],
                              rationale: '',
                              submitting: false,
                              error: '',
                              success: ''
                            })}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold cursor-pointer"
                            title="Revise Target Date"
                          >
                            Revise Date
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. USER WORKLOAD & DELAY VIEW ("Who Is Working On What?") */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-purple-600" />
              <h2 className="text-sm font-bold text-slate-900">
                User Workload & Delay Attribution Matrix ("Who Is Working On What?")
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Separates workload capacity from blame: evaluates underlying dependency delays before attributing responsibility.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider">
                <th className="py-2.5 px-3">User</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3 text-center">Active Jobs</th>
                <th className="py-2.5 px-3 text-center">Overdue</th>
                <th className="py-2.5 px-3 text-center">Completed</th>
                <th className="py-2.5 px-3 text-center">Completed Late</th>
                <th className="py-2.5 px-3 text-center">Reassigned To</th>
                <th className="py-2.5 px-3">Oldest Active Job</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {userAccountability.map(u => (
                <tr key={u.userId} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3 font-bold text-slate-900">{u.userName}</td>
                  <td className="py-2.5 px-3 text-slate-600 capitalize">{u.department}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-indigo-700">{u.activeAssignedJobs}</td>
                  <td className="py-2.5 px-3 text-center">
                    {u.overdueCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        {u.overdueCount}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-semibold text-emerald-700">{u.completedCount}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-rose-700">{u.completedLateCount || 0}</td>
                  <td className="py-2.5 px-3 text-center text-slate-600">{u.reassignedCount}</td>
                  <td className="py-2.5 px-3 text-slate-500">{u.oldestActiveJob || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. COMPLETE JOB ACCOUNTABILITY SLIDE-OUT DRAWER */}
      {selectedJobDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-amber-400">Job #{selectedJobDrawer.jobNo}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
                    {selectedJobDrawer.currentStage}
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  {selectedJobDrawer.clientName} • {selectedJobDrawer.projectName}
                </div>
              </div>
              <button
                onClick={() => setSelectedJobDrawer(null)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
              
              {/* Schedule Block */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Schedule & Commitments</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Original Planned Start:</span>
                    <strong className="text-slate-800">{selectedJobDrawer.expectedStart ? new Date(selectedJobDrawer.expectedStart).toLocaleDateString() : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Original Expected Date:</span>
                    <strong className="text-slate-900">{selectedJobDrawer.originalExpectedDate ? new Date(selectedJobDrawer.originalExpectedDate).toLocaleDateString() : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Current Expected Date:</span>
                    <strong className="text-indigo-700">{selectedJobDrawer.currentExpectedDate ? new Date(selectedJobDrawer.currentExpectedDate).toLocaleDateString() : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Days Variance:</span>
                    <strong className={selectedJobDrawer.daysVariance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {selectedJobDrawer.daysVariance > 0 ? `+${selectedJobDrawer.daysVariance} Days Overdue` : 'On Schedule'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 7 Distinct Roles Accountability Matrix (Section 10 Spec) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Accountability & Responsibility Matrix (7 Distinct Roles)
                </h4>
                <div className="space-y-1.5 divide-y divide-slate-100">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Currently Working By:</span>
                    <strong className="text-slate-900">{selectedJobDrawer.workingBy?.name} ({selectedJobDrawer.workingBy?.department})</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Planning Lead Owner:</span>
                    <strong className="text-slate-900">{selectedJobDrawer.planningOwnerName}</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Original Assigner:</span>
                    <strong className="text-slate-900">{selectedJobDrawer.assignedBy}</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Delay Reason Reporter:</span>
                    <strong className="text-slate-900">{selectedJobDrawer.reasonReportedBy || '—'}</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Reassignments Total:</span>
                    <strong className="text-purple-700">{selectedJobDrawer.reassignmentsCount} times</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Target Date Revisions:</span>
                    <strong className="text-cyan-700">{selectedJobDrawer.revisionsCount} times</strong>
                  </div>
                </div>
              </div>

              {/* Why Late Block */}
              {selectedJobDrawer.todayStatus === 'OVERDUE' && (
                <div className="bg-rose-50/70 p-4 rounded-xl border border-rose-200 space-y-2">
                  <h4 className="font-bold text-rose-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    <span>Why Is This Job Late?</span>
                  </h4>
                  <div>
                    <span className="text-rose-700 text-[10px] block font-bold">Category:</span>
                    <span className="font-semibold text-rose-950">{selectedJobDrawer.lateReason}</span>
                  </div>
                  {selectedJobDrawer.detailedExplanation && (
                    <div>
                      <span className="text-rose-700 text-[10px] block font-bold">Detailed Explanation:</span>
                      <p className="text-rose-900 text-xs bg-white p-2.5 rounded-lg border border-rose-200">
                        {selectedJobDrawer.detailedExplanation}
                      </p>
                    </div>
                  )}
                  {selectedJobDrawer.correctiveAction && (
                    <div>
                      <span className="text-rose-700 text-[10px] block font-bold">Corrective Action Required:</span>
                      <p className="text-rose-900 text-xs bg-white p-2.5 rounded-lg border border-rose-200">
                        {selectedJobDrawer.correctiveAction}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Actions in Drawer */}
              <div className="pt-4 border-t border-slate-200 flex gap-2">
                <Link
                  to={`/jobs/${selectedJobDrawer.id}`}
                  className="flex-1 py-2 text-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-sm"
                >
                  Open Full Job Detail
                </Link>
                <button
                  onClick={() => setSelectedJobDrawer(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 7. REVISION MODAL */}
      {revisionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-700">
                <Calendar size={18} />
                <h3 className="font-bold text-slate-900">Revise Expected Completion Date</h3>
              </div>
              <button onClick={() => setRevisionModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            <p className="text-xs text-slate-500">
              Job #{revisionModal.job?.jobNo} — Original commitment date is preserved in database history.
            </p>

            <form onSubmit={handleSubmitRevision} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">New Expected Date *</label>
                <input
                  type="date"
                  value={revisionModal.newDate}
                  onChange={(e) => setRevisionModal(prev => ({ ...prev, newDate: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason Category *</label>
                <select
                  value={revisionModal.reasonCategory}
                  onChange={(e) => setRevisionModal(prev => ({ ...prev, reasonCategory: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500"
                >
                  {DELAY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Revision Rationale (Mandatory) *</label>
                <textarea
                  value={revisionModal.rationale}
                  onChange={(e) => setRevisionModal(prev => ({ ...prev, rationale: e.target.value }))}
                  rows={3}
                  placeholder="Explain why deadline commitment is being revised..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              {revisionModal.error && <div className="p-2 bg-rose-50 text-rose-700 rounded-lg">{revisionModal.error}</div>}
              {revisionModal.success && <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">{revisionModal.success}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRevisionModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revisionModal.submitting}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {revisionModal.submitting ? 'Saving...' : 'Approve Revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. DELAY REVIEW MODAL */}
      {reviewModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle size={18} />
                <h3 className="font-bold text-slate-900">Admin Delay Investigation & Review</h3>
              </div>
              <button onClick={() => setReviewModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            <p className="text-xs text-slate-500">
              Job #{reviewModal.job?.jobNo} ({reviewModal.job?.clientName})
            </p>

            <form onSubmit={handleSubmitReview} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Delay Reason Category</label>
                <select
                  value={reviewModal.reasonCategory}
                  onChange={(e) => setReviewModal(prev => ({ ...prev, reasonCategory: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500"
                >
                  {DELAY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Admin Action</label>
                <select
                  value={reviewModal.action}
                  onChange={(e) => setReviewModal(prev => ({ ...prev, action: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="REVIEW">Record Formal Review</option>
                  <option value="RESOLVE">Mark Delay Resolved</option>
                  <option value="REQUEST_EXPLANATION">Demand Corrective Action</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Corrective Action Required</label>
                <input
                  type="text"
                  placeholder="e.g. Provide technical clarification by tomorrow 2 PM"
                  value={reviewModal.correctiveAction}
                  onChange={(e) => setReviewModal(prev => ({ ...prev, correctiveAction: e.target.value }))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Admin Review Notes</label>
                <textarea
                  value={reviewModal.notes}
                  onChange={(e) => setReviewModal(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Official admin directive / notes..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {reviewModal.error && <div className="p-2 bg-rose-50 text-rose-700 rounded-lg">{reviewModal.error}</div>}
              {reviewModal.success && <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">{reviewModal.success}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewModal.submitting}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {reviewModal.submitting ? 'Submitting...' : 'Record Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
