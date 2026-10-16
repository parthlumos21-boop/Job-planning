import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Briefcase, Clock, AlertTriangle, ArrowRightLeft, PlusCircle, Search,
  RefreshCw, CheckCircle2, ChevronRight, ChevronLeft, FileSpreadsheet,
  FileText, UserCheck, Shield, Sparkles, Filter, X, ArrowUpRight, CheckSquare,
  ArrowRight
} from 'lucide-react';
import { cleanJobNo, getHandoverAccountability, isMarketingLead } from '../config/marketingFormConfig';
import SimpleHandoverModal from '../jobs/SimpleHandoverModal';

const ITEMS_PER_PAGE = 10;

export default function MarketingJobDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState({
    activeJobs: 0,
    dueSoon: 0,
    overdue: 0,
    designHandoverPending: 0
  });
  const [taskSummary, setTaskSummary] = useState({
    openTasks: 0,
    dueToday: 0,
    overdue: 0,
    totalEstimatedHours: 0,
    totalActualHours: 0,
    jobsBlockedByTasksCount: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [scope, setScope] = useState('all'); // 'all' or 'my'
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [handoverModalJob, setHandoverModalJob] = useState(null);
  const [showActivityFeed, setShowActivityFeed] = useState(false);

  const isLead = isMarketingLead(user);
  // Exclusively allow Keval V Shah to access & download the Marketing report
  const isKeval = user?.username?.trim().toLowerCase() === 'keval v shah';

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const res = await api.get(`/jobs/marketing-dashboard?scope=${scope}`);
      setJobs(res.data?.jobs || []);
      if (res.data?.stats) {
        setStats(res.data.stats);
      }
      if (res.data?.taskSummary) {
        setTaskSummary(res.data.taskSummary);
      }
      if (res.data?.recentActivity) {
        setRecentActivity(res.data.recentActivity);
      }
    } catch (err) {
      console.error('Failed to load marketing dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [scope]);

  // Reset to page 1 whenever search, activeFilter, or scope changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeFilter, scope]);

  // Handle Keval V Shah exclusive Excel Report Download
  const handleDownloadReport = async () => {
    if (!isKeval) return;
    try {
      setDownloadingReport(true);
      const res = await api.get('/export/xlsx?department=marketing', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Marketing_Job_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download marketing report:', err);
      alert('Failed to download report: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDownloadingReport(false);
    }
  };

  // 100% Case-insensitive search across 5 fields & 7 workflow status filters
  const filteredJobs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const userNameLower = (user?.name || user?.username || '').trim().toLowerCase();

    return jobs.filter((job) => {
      // 100% Case-Insensitive Search across 5 fields
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const rawJobNo = (job.jobNo || '').trim().toLowerCase();
        const cleanNo = cleanJobNo(job.jobNo).toLowerCase();
        const matchesJobNo = cleanNo.includes(q) || rawJobNo.includes(q);
        const matchesClient = (job.clientName || '').toLowerCase().includes(q);
        const matchesProject = (job.projectName || '').toLowerCase().includes(q);
        const matchesPanel = (job.panelName || '').toLowerCase().includes(q);
        const matchesEngg = (job.responsibleEnggName || '').toLowerCase().includes(q);

        if (!matchesJobNo && !matchesClient && !matchesProject && !matchesPanel && !matchesEngg) {
          return false;
        }
      }

      const isCompleted =
        (job.lifecycleStatus || '').toLowerCase() === 'completed' ||
        job.actualEndAt !== null ||
        (job.departmentStatus || {}).dispatch === 'completed';

      const hStatus = (job.handoverStatus || '').toLowerCase();
      const isHandedOver = hStatus.includes('submitted') || hStatus.includes('pending') || (job.targetDepartment || '').toLowerCase() === 'design';
      const isReturned = hStatus.includes('returned') || Boolean(job.handoverReturnReason);
      const isReadyToRelease = Boolean(job.dataGivenToDesign && String(job.dataGivenToDesign).trim()) && !isHandedOver && !isCompleted;

      // 7 Status filters
      if (activeFilter === 'my_open') {
        const isMy =
          (job.responsibleEnggName || '').trim().toLowerCase() === userNameLower ||
          job.assignedEngineerId === user?.id ||
          (job.createdBy || '').trim().toLowerCase() === (user?.username || '').trim().toLowerCase();
        if (!isMy || isCompleted) return false;
      } else if (activeFilter === 'in_progress') {
        if (isCompleted) return false;
      } else if (activeFilter === 'ready_to_release') {
        if (!isReadyToRelease) return false;
      } else if (activeFilter === 'awaiting_acceptance') {
        if (!isHandedOver) return false;
      } else if (activeFilter === 'returned') {
        if (!isReturned) return false;
      } else if (activeFilter === 'overdue') {
        if (isCompleted) return false;
        const expDate = job.stageDueDate || job.plannedEndAt || job.deliveryDate;
        if (!expDate) return false;
        const d = new Date(expDate);
        if (isNaN(d.getTime()) || d >= today) return false;
      }

      return true;
    });
  }, [jobs, search, activeFilter, user]);

  // Dynamic tab counts for the 7 filters
  const tabCounts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const userNameLower = (user?.name || user?.username || '').trim().toLowerCase();

    const counts = {
      all: jobs.length,
      my_open: 0,
      in_progress: 0,
      ready_to_release: 0,
      awaiting_acceptance: 0,
      returned: 0,
      overdue: 0
    };

    jobs.forEach((job) => {
      const isCompleted =
        (job.lifecycleStatus || '').toLowerCase() === 'completed' ||
        job.actualEndAt !== null ||
        (job.departmentStatus || {}).dispatch === 'completed';

      const hStatus = (job.handoverStatus || '').toLowerCase();
      const isHandedOver = hStatus.includes('submitted') || hStatus.includes('pending') || (job.targetDepartment || '').toLowerCase() === 'design';
      const isReturned = hStatus.includes('returned') || Boolean(job.handoverReturnReason);
      const isReadyToRelease = Boolean(job.dataGivenToDesign && String(job.dataGivenToDesign).trim()) && !isHandedOver && !isCompleted;

      const isMy =
        (job.responsibleEnggName || '').trim().toLowerCase() === userNameLower ||
        job.assignedEngineerId === user?.id ||
        (job.createdBy || '').trim().toLowerCase() === (user?.username || '').trim().toLowerCase();

      if (isMy && !isCompleted) counts.my_open++;
      if (!isCompleted) counts.in_progress++;
      if (isReadyToRelease) counts.ready_to_release++;
      if (isHandedOver) counts.awaiting_acceptance++;
      if (isReturned) counts.returned++;

      if (!isCompleted) {
        const expDate = job.stageDueDate || job.plannedEndAt || job.deliveryDate;
        if (expDate) {
          const d = new Date(expDate);
          if (!isNaN(d.getTime()) && d < today) {
            counts.overdue++;
          }
        }
      }
    });

    return counts;
  }, [jobs, user]);

  // Pagination calculation (strictly 10 records per page)
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / ITEMS_PER_PAGE));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredJobs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredJobs, currentPage]);

  const handleHandoverSuccess = (updatedJob) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === updatedJob.id ? { ...j, ...updatedJob } : j))
    );
    fetchDashboardData();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Marketing Job Dashboard
            </h1>
            <button
              onClick={fetchDashboardData}
              disabled={refreshing}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all ${
                refreshing ? 'animate-spin' : ''
              }`}
              title="Refresh Live Data"
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Internal Marketing Job Register, Purchase Orders & Design Handover
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Scope Toggle (All Marketing Users) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-700">
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scope === 'all' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              All Team Jobs
            </button>
            <button
              onClick={() => setScope('my')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scope === 'my' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'
              }`}
            >
              My Assigned
            </button>
          </div>

          {/* Activity Feed Trigger */}
          {isLead && recentActivity.length > 0 && (
            <button
              onClick={() => setShowActivityFeed(!showActivityFeed)}
              className="inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3.5 py-2.5 rounded-xl border border-indigo-200 transition-all text-xs"
            >
              <Sparkles size={15} />
              Team Activity ({recentActivity.length})
            </button>
          )}

          {/* Download Marketing Report (EXCLUSIVELY FOR KEVAL V SHAH) */}
          {isKeval && (
            <button
              onClick={handleDownloadReport}
              disabled={downloadingReport}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2.5 rounded-xl shadow-xs hover:shadow transition-all text-xs disabled:opacity-50"
              title="Download Full Marketing Register Excel Report"
            >
              {downloadingReport ? (
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={15} />
              )}
              Download Marketing Report
            </button>
          )}

          {/* Create Job */}
          <button
            onClick={() => navigate('/jobs/new')}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs hover:shadow transition-all text-xs"
          >
            <PlusCircle size={16} />
            Create New Job
          </button>
        </div>
      </div>

      {/* User Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
            {isLead ? <Shield size={20} /> : <UserCheck size={20} />}
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">
              {isLead
                ? `Marketing Control & Activity Center (${user?.name || user?.username || 'mktadmin'})`
                : `Welcome, ${user?.name || user?.username || 'Marketing User'}`}
            </h2>
            <p className="text-xs text-indigo-200 font-medium">
              Manage client projects, track purchase orders, and transfer validated job packages to Design.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 self-start sm:self-auto">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Live Database Connected
        </div>
      </div>

      {/* Recent Activity Drawer (For Lead / mktadmin) */}
      {isLead && showActivityFeed && recentActivity.length > 0 && (
        <div className="bg-white rounded-2xl border border-indigo-100 p-4 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-600" />
              Live Marketing Team Activity Feed
            </h3>
            <button
              onClick={() => setShowActivityFeed(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {recentActivity.map((act) => (
              <div key={act.id} className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="font-bold text-slate-900">Job {cleanJobNo(act.jobId)}</span>
                  <span className="text-[11px] text-slate-400">
                    {act.createdAt ? new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <p className="text-indigo-700 font-semibold">{act.action.replace(/_/g, ' ')}</p>
                <p className="text-slate-500 text-[11px]">By: <span className="font-medium text-slate-800">{act.updatedBy || 'Marketing'}</span></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Live KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Jobs */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'in_progress' ? 'all' : 'in_progress')}
          className={`cursor-pointer bg-white rounded-2xl p-5 border transition-all ${
            activeFilter === 'in_progress'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
              : 'border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Jobs</span>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <Briefcase size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.activeJobs}</p>
          <p className="text-xs text-slate-400 mt-1 font-medium">Currently in marketing progress</p>
        </div>

        {/* Card 2: Due Soon */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'overdue' ? 'all' : 'overdue')}
          className="cursor-pointer bg-white rounded-2xl p-5 border border-slate-200 hover:border-slate-300 shadow-xs transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Due Soon</span>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <Clock size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.dueSoon}</p>
          <p className="text-xs text-amber-600 mt-1 font-semibold">Delivery within 3 days</p>
        </div>

        {/* Card 3: Overdue */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'overdue' ? 'all' : 'overdue')}
          className={`cursor-pointer bg-white rounded-2xl p-5 border transition-all ${
            activeFilter === 'overdue'
              ? 'border-rose-500 ring-2 ring-rose-500/20 shadow-md'
              : 'border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overdue</span>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">{stats.overdue}</p>
          <p className="text-xs text-rose-600 mt-1 font-semibold">Past expected target date</p>
        </div>

        {/* Card 4: Design Handover Pending */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'awaiting_acceptance' ? 'all' : 'awaiting_acceptance')}
          className={`cursor-pointer bg-white rounded-2xl p-5 border transition-all ${
            activeFilter === 'awaiting_acceptance'
              ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
              : 'border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Design Handover Pending</span>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <ArrowRightLeft size={20} />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-700 mt-2">{stats.designHandoverPending}</p>
          <p className="text-xs text-indigo-600 mt-1 font-semibold">Awaiting transfer or acceptance</p>
        </div>
      </div>

      {/* Marketing Tasks & Effort Summary Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-blue-500/20 border border-blue-400/30 rounded-2xl text-blue-300">
            <CheckSquare size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-tight">Marketing My Tasks & Effort</h3>
              {taskSummary.openTasks > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-500/30 border border-blue-400/40 text-[10px] font-bold text-blue-200">
                  {taskSummary.openTasks} Open
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Track your scheduled deadlines, required effort, and tasks blocking job readiness.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xs px-4 py-2 rounded-2xl border border-white/10 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Due Today</span>
              <span className="text-sm font-black text-amber-300">{taskSummary.dueToday}</span>
            </div>
            <div className="h-6 w-px bg-white/20"></div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Overdue</span>
              <span className={`text-sm font-black ${taskSummary.overdue > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {taskSummary.overdue}
              </span>
            </div>
            <div className="h-6 w-px bg-white/20"></div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Est. Effort</span>
              <span className="text-sm font-black text-blue-200">{taskSummary.totalEstimatedHours}h</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/my-tasks')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-blue-50 text-xs font-bold transition-all shadow-sm"
          >
            <span>Open My Tasks</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Search & 7 Real Workflow Status Filter Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* 100% Case-Insensitive Search Input across 5 fields */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Job No (e.g. RA101/01, 21), Customer, Project, Panel, Engineer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title="Clear Search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {search && (
            <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 whitespace-nowrap">
              <span>Found <strong className="text-indigo-600">{filteredJobs.length}</strong> matching records</span>
            </div>
          )}
        </div>

        {/* 7 Actionable Workflow Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100">
          {[
            { id: 'all', label: 'All Jobs', count: tabCounts.all },
            { id: 'my_open', label: 'My Open Jobs', count: tabCounts.my_open },
            { id: 'in_progress', label: 'In Progress', count: tabCounts.in_progress },
            { id: 'ready_to_release', label: 'Ready to Release to Design', count: tabCounts.ready_to_release },
            { id: 'awaiting_acceptance', label: 'Awaiting Design Acceptance', count: tabCounts.awaiting_acceptance },
            { id: 'returned', label: 'Returned for Correction', count: tabCounts.returned },
            { id: 'overdue', label: 'Overdue', count: tabCounts.overdue }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeFilter === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Internal Marketing Table (10 Requested Core Fields) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              Marketing Jobs Directory
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {filteredJobs.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredJobs.length)} of {filteredJobs.length} authorized marketing records
            </p>
          </div>
          {search && (
            <button
              onClick={() => { setSearch(''); setActiveFilter('all'); }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold self-start sm:self-auto"
            >
              Reset Filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <RefreshCw size={26} className="animate-spin mx-auto mb-2 text-indigo-600" />
            Loading live marketing records...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Search size={22} />
            </div>
            <p className="text-sm font-bold text-slate-800">No marketing jobs found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {search
                ? `No jobs match "${search}" with the "${activeFilter.replace(/_/g, ' ')}" filter.`
                : 'No jobs are currently available in this filter stage.'}
            </p>
            {(search || activeFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setActiveFilter('all'); }}
                className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all"
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
                  const isHandedOver = (job.handoverStatus || '').toLowerCase().includes('submitted');
                  const isReturned = (job.handoverStatus || '').toLowerCase().includes('returned') || Boolean(job.handoverReturnReason);
                  const isCompleted =
                    (job.lifecycleStatus || '').toLowerCase() === 'completed' ||
                    job.actualEndAt !== null;

                  return (
                    <tr key={job.id} className="hover:bg-blue-50/40 transition-colors">
                      {/* 1. Job Number (Clean display without #) */}
                      <td className="py-3 px-3.5 font-black text-blue-700 text-xs whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="hover:underline hover:text-blue-900 flex items-center gap-1 font-bold"
                          title="Open Job Details"
                        >
                          {cleanJobNo(job.jobNo)}
                        </button>
                      </td>

                      {/* 2. Project Name */}
                      <td className="py-3 px-3.5 text-slate-700 max-w-[180px] truncate" title={job.projectName}>
                        {job.projectName || '—'}
                      </td>

                      {/* 3. Customer */}
                      <td className="py-3 px-3.5 font-bold text-slate-900 max-w-[180px] truncate" title={job.clientName}>
                        {job.clientName || 'General Client'}
                      </td>

                      {/* 4. Panel Name */}
                      <td className="py-3 px-3.5 font-semibold text-slate-800 max-w-[180px] truncate" title={job.panelName}>
                        <div>{job.panelName || 'Standard Panel'}</div>
                        {job.qty && job.qty !== '1' && (
                          <span className="text-[10px] text-slate-400">Qty: {job.qty}</span>
                        )}
                      </td>

                      {/* 5. Engineer */}
                      <td className="py-3 px-3.5 font-medium text-slate-800 whitespace-nowrap">
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
                        ) : isReturned ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                            <AlertTriangle size={11} /> Returned
                          </span>
                        ) : isHandedOver ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                            <ArrowRightLeft size={11} /> In Design
                          </span>
                        ) : job.dataGivenToDesign ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                            Ready to Release
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                            <Clock size={11} /> In Marketing
                          </span>
                        )}
                      </td>

                      {/* 8. Next Action */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {!isCompleted && !isHandedOver ? (
                          <button
                            onClick={() => setHandoverModalJob(job)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold transition-all text-xs flex items-center gap-1"
                            title="Handover to Design"
                          >
                            <ArrowRightLeft size={12} />
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
                          title="Open Job Details"
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

        {/* Strict Pagination Controls (10 records per page) */}
        {filteredJobs.length > 0 && (
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
              <span className="font-bold text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, filteredJobs.length)}</span> of{' '}
              <span className="font-bold text-slate-800">{filteredJobs.length}</span> entries (Page {currentPage} of {totalPages})
            </div>

            <div className="flex items-center gap-1 self-center sm:self-auto">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1 transition-all"
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
                          <span className="px-1 text-slate-400 text-xs font-bold">...</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(p)}
                          className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
                            currentPage === p
                              ? 'bg-indigo-600 text-white shadow-xs'
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
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1 transition-all"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Simple & Unique Handover Modal */}
      {handoverModalJob && (
        <SimpleHandoverModal
          job={handoverModalJob}
          isOpen={Boolean(handoverModalJob)}
          onClose={() => setHandoverModalJob(null)}
          onSuccess={handleHandoverSuccess}
        />
      )}
    </div>
  );
}
