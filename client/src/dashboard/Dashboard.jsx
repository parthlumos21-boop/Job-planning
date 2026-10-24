import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Clock, CheckCircle2, Building,
  ArrowRightLeft, Layers, X,
  RefreshCw, PlusCircle, ChevronRight, ChevronDown
} from 'lucide-react';
import StatsCard from '../components/StatsCard';
import DepartmentMetricCard from '../components/DepartmentMetricCard';
import DepartmentHandoverModal from '../jobs/DepartmentHandoverModal';
import SearchJobsSection from '../components/SearchJobsSection';
import { isMarketingUser } from '../config/marketingFormConfig';
import MarketingJobDashboard from './MarketingJobDashboard';

const TRACKED_DEPTS = ['marketing', 'design', 'mechanical', 'purchase', 'production'];

const DEPT_DISPLAY_NAMES = {
  marketing: 'Marketing',
  design: 'Design - Electrical',
  mechanical: 'Design - Mechanical',
  purchase: 'Procurement',
  production: 'Production & QC & Dispatch',
  dispatch: 'Production & QC & Dispatch',
  qc: 'Production & QC & Dispatch'
};

const AVAILABLE_DEPTS_OPTIONS = [
  { key: 'marketing', label: 'Marketing' },
  { key: 'design', label: 'Design - Electrical' },
  { key: 'mechanical', label: 'Design - Mechanical' },
  { key: 'purchase', label: 'Procurement' },
  { key: 'production', label: 'Production & QC & Dispatch' }
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isKeval = useMemo(() => {
    const uname = (user?.username || '').trim().toLowerCase();
    const name = (user?.name || '').trim().toLowerCase();
    return ['keval v shah', 'keval', 'kevalvshah'].includes(uname) ||
           ['keval v shah', 'keval', 'kevalvshah'].includes(name) ||
           uname.includes('keval') ||
           name.includes('keval');
  }, [user]);

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || isKeval;
  const isMkt = isMarketingUser(user);

  // Marketing users (swatisales, swatisales2, etc.) always view the Marketing Dashboard
  if (isMkt && !isAdmin) {
    return <MarketingJobDashboard />;
  }

  const primaryDept = user?.departments?.[0] || '';
  const [selectedDept, setSelectedDept] = useState(isAdmin ? 'all' : primaryDept);
  const [viewMode, setViewMode] = useState('master');

  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeHandoverJob, setActiveHandoverJob] = useState(null);

  if (viewMode === 'marketing') {
    return (
      <div className="space-y-4">
        {isAdmin && (
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setViewMode('master')}
              className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-all"
            >
              ← Back to Master Planning Register
            </button>
          </div>
        )}
        <MarketingJobDashboard />
      </div>
    );
  }

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const deptParam = (isAdmin && selectedDept !== 'all')
        ? `?department=${selectedDept}`
        : (!isAdmin && primaryDept ? `?department=${primaryDept}` : '');
      const [jobsRes, statsRes] = await Promise.all([
        api.get(`/jobs${deptParam}`),
        api.get('/jobs/stats')
      ]);

      const rawJobs = jobsRes.data?.jobs || (Array.isArray(jobsRes.data) ? jobsRes.data : []);
      setJobs(rawJobs);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDept]);

  // Unique clients count
  const uniqueClientsCount = useMemo(() => {
    const clients = new Set();
    jobs.forEach(j => {
      if (j.clientName) clients.add(j.clientName.trim());
    });
    return clients.size;
  }, [jobs]);

  const totalJobsCount = stats?.overall?.total || jobs.length;
  const completedJobsCount = stats?.overall?.completed || jobs.filter(j => (j.departmentStatus || {}).dispatch === 'completed').length;
  const inProgressJobsCount = stats?.overall?.pending || (totalJobsCount - completedJobsCount);
  const pendingHandoversCount = useMemo(() => {
    return jobs.filter(j => j.handoverStatus === 'submitted').length;
  }, [jobs]);

  return (
    <div className="space-y-8 pb-12">

      {/* Handover Attention Banner */}
      {pendingHandoversCount > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <ArrowRightLeft size={20} />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {pendingHandoversCount} Job{pendingHandoversCount > 1 ? 's' : ''} Awaiting Planning Acceptance
              </p>
              <p className="text-xs text-amber-700 font-medium">
                New job handovers have been submitted and are pending review or owner assignment.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => navigate('/jobs/handover')}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shrink-0"
            >
              Open Planning Control Center →
            </button>
          )}
        </div>
      )}

      {/* Top Action Bar (Above KPI Cards, Right-Aligned, Responsive) */}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5 mb-3.5">
        {/* Pill Button: Refresh Data */}
        <button
          onClick={fetchData}
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

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatsCard
          title="Total Registered Jobs"
          value={totalJobsCount}
          icon={<Briefcase size={18} strokeWidth={2} />}
          trend="+5.3%"
          trendPositive={true}
          subtitle="vs last 30 days"
        />
        <StatsCard
          title="In Progress / Pending"
          value={inProgressJobsCount}
          icon={<Clock size={18} strokeWidth={2} />}
          subtitle="Current active jobs"
        />
        <StatsCard
          title="Completed & Dispatched"
          value={completedJobsCount}
          icon={<CheckCircle2 size={18} strokeWidth={2} />}
          subtitle="Completed jobs"
        />
        <StatsCard
          title="Active Clients"
          value={uniqueClientsCount || 10}
          icon={<Building size={18} strokeWidth={2} />}
          subtitle="Active customers"
        />
      </div>

      {/* Connected Node-to-Node Pipeline Container */}
      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
        {/* Internal Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Department Workflow Pipeline
            </h2>
          </div>
          {isAdmin && selectedDept !== 'all' && (
            <button
              onClick={() => setSelectedDept('all')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/60"
            >
              <X size={12} /> Clear Filter
            </button>
          )}
        </div>
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center">
            {TRACKED_DEPTS.map((deptKey, idx) => (
              <React.Fragment key={deptKey}>
                {/* Node Card */}
                <div className="flex-1 min-w-0 relative">
                  <DepartmentMetricCard
                    deptKey={deptKey}
                    stats={stats?.[deptKey]}
                    isSelected={selectedDept === deptKey}
                    onClick={() => {
                      if (isAdmin) {
                        setSelectedDept(prev => prev === deptKey ? 'all' : deptKey);
                      }
                    }}
                  />
                </div>

                {/* Connected Pipeline Edge */}
                {idx < TRACKED_DEPTS.length - 1 && (
                  <div className="relative flex items-center justify-center shrink-0 my-1 lg:my-0 lg:w-8 xl:w-10 h-7 lg:h-auto" title="Pipeline Flow">
                    {/* Horizontal Pipeline Pipe (Desktop) */}
                    <div className="hidden lg:block absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-slate-300 via-blue-400 to-slate-300 rounded-full" />
                    
                    {/* Vertical Pipeline Pipe (Mobile) */}
                    <div className="block lg:hidden absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-gradient-to-b from-slate-300 via-blue-400 to-slate-300 rounded-full" />

                    {/* Edge Node Badge with Directional Arrow */}
                    <div className="relative z-10 w-6 h-6 rounded-full bg-white border-2 border-blue-600 shadow-xs flex items-center justify-center text-blue-600 transition-transform duration-200 hover:scale-110">
                      <ChevronRight size={13} className="hidden lg:block text-blue-600" strokeWidth={2.5} />
                      <ChevronDown size={13} className="block lg:hidden text-blue-600" strokeWidth={2.5} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

      {/* Universal Search Jobs Section (Visual Reference 9 Columns & Blue-and-White Theme) */}
      <SearchJobsSection
        jobs={jobs}
        loading={loading}
        onRefresh={fetchData}
        isAdmin={isAdmin}
        selectedDept={selectedDept}
        onDeptChange={(newDept) => setSelectedDept(newDept)}
        userDeptName={isAdmin ? '' : (DEPT_DISPLAY_NAMES[primaryDept] || (primaryDept ? primaryDept.toUpperCase() : ''))}
        onHandoverClick={(job) => setActiveHandoverJob(job)}
      />

      {/* Department Handover Modal */}
      {activeHandoverJob && (
        <DepartmentHandoverModal
          job={activeHandoverJob}
          isOpen={Boolean(activeHandoverJob)}
          onClose={() => setActiveHandoverJob(null)}
          onHandoverSuccess={() => {
            setActiveHandoverJob(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
