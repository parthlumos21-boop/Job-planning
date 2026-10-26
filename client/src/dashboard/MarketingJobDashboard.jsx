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
import StatsCard from '../components/StatsCard';

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
  const [lastUpdated, setLastUpdated] = useState(new Date());

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
      setLastUpdated(new Date());
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
      {/* Top Action Bar (Above KPI Cards, Right-Aligned, Responsive - matches /admin/dashboard) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        {/* Left Side: Clean Marketing Status Indicator */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50/80 border border-blue-100/90 text-[#0000AA] flex items-center justify-center shrink-0 shadow-2xs">
            <Briefcase size={16} strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Marketing Register &amp; Dispatch Tracking</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Live Operations
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Welcome, <strong className="text-slate-700">{user?.name || user?.username || 'Marketing User'}</strong> &bull; Commercial readiness, design release &amp; delivery milestones
            </p>
          </div>
        </div>

        {/* Right Side Pill Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Activity Feed Pill */}
          {isLead && recentActivity.length > 0 && (
            <button
              onClick={() => setShowActivityFeed(!showActivityFeed)}
              className="h-[34px] px-3 sm:px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer shrink-0"
            >
              <Sparkles size={13} strokeWidth={2} className="text-amber-500" />
              <span>Team Activity ({recentActivity.length})</span>
            </button>
          )}

          {/* Keval Exclusive Download Report */}
          {isKeval && (
            <button
              onClick={handleDownloadReport}
              disabled={downloadingReport}
              className="h-[34px] px-3 sm:px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 shadow-2xs hover:bg-emerald-100 transition-all cursor-pointer shrink-0 disabled:opacity-50"
              title="Download Full Marketing Register Excel Report"
            >
              {downloadingReport ? (
                <RefreshCw size={13} className="animate-spin text-emerald-600" />
              ) : (
                <FileSpreadsheet size={13} strokeWidth={2} className="text-emerald-700" />
              )}
              <span>Export Excel</span>
            </button>
          )}

          {/* Pill Button: Refresh Data */}
          <button
            onClick={fetchDashboardData}
            disabled={refreshing}
            className={`h-[34px] px-3 sm:px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer shrink-0 ${
              refreshing ? 'opacity-70' : ''
            }`}
            title="Refresh Data"
          >
            <RefreshCw
              size={13}
              strokeWidth={2}
              className={`text-slate-500 ${refreshing ? 'animate-spin text-[#0000AA]' : ''}`}
            />
            <span className="whitespace-nowrap">Refresh Data</span>
          </button>

          {/* Pill Button: Create Job */}
          <button
            onClick={() => navigate('/jobs/new')}
            className="h-[34px] px-3 sm:px-3.5 rounded-full flex items-center gap-1.5 text-xs font-bold text-white bg-[#0000AA] hover:bg-blue-900 shadow-xs hover:shadow transition-all cursor-pointer shrink-0"
            title="Create Job"
          >
            <PlusCircle size={15} strokeWidth={2.2} />
            <span className="whitespace-nowrap">Create Job</span>
          </button>
        </div>
      </div>

      {/* Recent Activity Drawer (For Lead / mktadmin) */}
      {isLead && showActivityFeed && recentActivity.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Sparkles size={14} className="text-blue-600" />
              Live Marketing Team Activity Feed
            </h3>
            <button
              onClick={() => setShowActivityFeed(false)}
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
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
                <p className="text-blue-700 font-semibold">{act.action.replace(/_/g, ' ')}</p>
                <p className="text-slate-500 text-[11px]">By: <span className="font-medium text-slate-800">{act.updatedBy || 'Marketing'}</span></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 LIVE KPI CARDS using standard StatsCard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Active Jobs */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'in_progress' ? 'all' : 'in_progress')}
          className={`cursor-pointer rounded-2xl transition-all ${
            activeFilter === 'in_progress' ? 'ring-2 ring-[#0000AA] shadow-xs' : ''
          }`}
          title="Click to filter Active Jobs"
        >
          <StatsCard
            title="Active Jobs"
            value={stats.activeJobs}
            icon={<Briefcase size={18} strokeWidth={2} />}
            subtitle="Currently in progress"
          />
        </div>

        {/* Card 2: Due Soon */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'overdue' ? 'all' : 'overdue')}
          className={`cursor-pointer rounded-2xl transition-all ${
            activeFilter === 'overdue' ? 'ring-2 ring-amber-500 shadow-xs' : ''
          }`}
          title="Click to filter Due Soon"
        >
          <StatsCard
            title="Due Soon"
            value={stats.dueSoon}
            icon={<Clock size={18} strokeWidth={2} />}
            subtitle="Delivery within 3 days"
          />
        </div>

        {/* Card 3: Overdue */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'overdue' ? 'all' : 'overdue')}
          className={`cursor-pointer rounded-2xl transition-all ${
            activeFilter === 'overdue' ? 'ring-2 ring-rose-500 shadow-xs' : ''
          }`}
          title="Click to filter Overdue"
        >
          <StatsCard
            title="Overdue"
            value={stats.overdue}
            icon={<AlertTriangle size={18} strokeWidth={2} />}
            subtitle="Past expected target date"
          />
        </div>

        {/* Card 4: Design Handover Pending */}
        <div
          onClick={() => setActiveFilter(activeFilter === 'awaiting_acceptance' ? 'all' : 'awaiting_acceptance')}
          className={`cursor-pointer rounded-2xl transition-all ${
            activeFilter === 'awaiting_acceptance' ? 'ring-2 ring-blue-500 shadow-xs' : ''
          }`}
          title="Click to filter Design Handover Pending"
        >
          <StatsCard
            title="Design Handover Pending"
            value={stats.designHandoverPending}
            icon={<ArrowRightLeft size={18} strokeWidth={2} />}
            subtitle="Awaiting design transfer"
          />
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
