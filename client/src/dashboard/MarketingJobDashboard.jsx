import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Briefcase, Clock, AlertTriangle, ArrowRightLeft, PlusCircle, Search,
  RefreshCw, CheckCircle2, ChevronRight, ChevronLeft, FileSpreadsheet,
  FileText, UserCheck, Shield, Sparkles, Filter, X, ArrowUpRight
} from 'lucide-react';
import { cleanJobNo, getHandoverAccountability, isMarketingLead } from '../config/marketingFormConfig';
import SimpleHandoverModal from '../jobs/SimpleHandoverModal';
import ReHandoverModal from '../jobs/modals/ReHandoverModal';
import ReassignEngineerModal from '../jobs/modals/ReassignEngineerModal';
import SearchJobsSection from '../components/SearchJobsSection';

const ITEMS_PER_PAGE = 10;

export default function MarketingJobDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [globalJobs, setGlobalJobs] = useState([]);
  const [selectedGlobalDept, setSelectedGlobalDept] = useState('all');
  const [globalLoading, setGlobalLoading] = useState(false);
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
  const [scope, setScope] = useState('all'); // default to all
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [handoverModalJob, setHandoverModalJob] = useState(null);
  const [reassignModalJob, setReassignModalJob] = useState(null);
  const [reHandoverModalJob, setReHandoverModalJob] = useState(null);
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

  const fetchGlobalJobs = async () => {
    try {
      setGlobalLoading(true);
      const deptParam = selectedGlobalDept !== 'all' ? `?department=${selectedGlobalDept}` : '';
      const res = await api.get(`/jobs${deptParam}`);
      const raw = res.data?.jobs || (Array.isArray(res.data) ? res.data : []);
      setGlobalJobs(raw);
    } catch (e) {
      console.error('Failed to load global jobs:', e);
    } finally {
      setGlobalLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalJobs();
  }, [selectedGlobalDept]);

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Welcome, {user?.name || user?.username || 'Marketing User'}
          </h1>
          <button
            onClick={fetchDashboardData}
            disabled={refreshing}
            className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer ${
              refreshing ? 'animate-spin' : ''
            }`}
            title="Refresh Live Data"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">

          {/* Activity Feed Trigger */}
          {isLead && recentActivity.length > 0 && (
            <button
              onClick={() => setShowActivityFeed(!showActivityFeed)}
              className="inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3.5 py-2.5 rounded-xl border border-indigo-200 transition-all text-xs cursor-pointer"
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
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2.5 rounded-xl shadow-xs hover:shadow transition-all text-xs disabled:opacity-50 cursor-pointer"
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
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs hover:shadow transition-all text-xs cursor-pointer"
          >
            <PlusCircle size={16} />
            Create New Job
          </button>
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



      {/* Global Cross-Department Search & Multi-Team Directory */}
      <SearchJobsSection
        jobs={globalJobs}
        loading={globalLoading}
        onRefresh={fetchGlobalJobs}
        isAdmin={true}
        selectedDept={selectedGlobalDept}
        onDeptChange={(newDept) => setSelectedGlobalDept(newDept)}
        userDeptName="Global Master"
        onHandoverClick={(job) => setHandoverModalJob(job)}
      />


      {/* Simple Handover Modal */}
      {handoverModalJob && (
        <SimpleHandoverModal
          job={handoverModalJob}
          isOpen={Boolean(handoverModalJob)}
          onClose={() => setHandoverModalJob(null)}
          onSuccess={handleHandoverSuccess}
        />
      )}

      {/* Reassign Engineer Modal */}
      {reassignModalJob && (
        <ReassignEngineerModal
          job={reassignModalJob}
          isOpen={Boolean(reassignModalJob)}
          onClose={() => setReassignModalJob(null)}
          onSuccess={(updatedJob) => {
            handleHandoverSuccess(updatedJob);
            setReassignModalJob(null);
          }}
        />
      )}

      {/* Re-Handover Modal */}
      {reHandoverModalJob && (
        <ReHandoverModal
          job={reHandoverModalJob}
          isOpen={Boolean(reHandoverModalJob)}
          onClose={() => setReHandoverModalJob(null)}
          onSuccess={(updatedJob) => {
            handleHandoverSuccess(updatedJob);
            setReHandoverModalJob(null);
          }}
        />
      )}
    </div>
  );
}
