import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle, Briefcase, Clock, CheckCircle2, Building,
  Search, Filter, RefreshCw, X, ArrowRightLeft, Layers
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

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase() === 'keval v shah';
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
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Job Planning Dashboard
            <button
              onClick={fetchData}
              disabled={refreshing}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all ${refreshing ? 'animate-spin' : ''}`}
              title="Refresh Data"
            >
              <RefreshCw size={17} />
            </button>
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            {isAdmin
              ? 'Real-time departmental workflow tracking & master job register'
              : `${primaryDept ? primaryDept.toUpperCase() : 'Department'} live workflow & project records`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => navigate('/jobs/handover')}
              className="relative inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3.5 py-2.5 rounded-xl border border-indigo-200 transition-all text-sm"
            >
              <ArrowRightLeft size={16} />
              Planning Control Center
              {pendingHandoversCount > 0 && (
                <span className="bg-amber-500 text-white text-[11px] font-black px-1.5 py-0.5 rounded-full shadow-xs">
                  {pendingHandoversCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => navigate('/my-jobs')}
            className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 transition-all text-sm"
          >
            <Layers size={16} />
            My Jobs
          </button>

          <button
            onClick={() => navigate('/jobs/new')}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all text-sm"
          >
            <PlusCircle size={17} />
            Create New Job
          </button>
        </div>
      </div>

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

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Registered Jobs"
          value={totalJobsCount}
          icon={<Briefcase size={26} />}
          color="blue"
        />
        <StatsCard
          title="In Progress / Pending"
          value={inProgressJobsCount}
          icon={<Clock size={26} />}
          color="orange"
        />
        <StatsCard
          title="Completed & Dispatched"
          value={completedJobsCount}
          icon={<CheckCircle2 size={26} />}
          color="green"
        />
        <StatsCard
          title="Active Clients"
          value={uniqueClientsCount || 58}
          icon={<Building size={26} />}
          color="purple"
        />
      </div>

      {/* Department Pipeline Cards Grid (for Admins or Department Context) */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h2 className="text-base font-bold text-slate-800">Department Workflow Pipeline</h2>
            <p className="text-xs text-slate-500">
              {isAdmin
                ? 'Click any card to filter jobs by department'
                : 'Live departmental progress and status metrics'}
            </p>
          </div>
          {isAdmin && selectedDept !== 'all' && (
            <button
              onClick={() => setSelectedDept('all')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <X size={13} /> Clear Department Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {TRACKED_DEPTS.map(deptKey => (
            <DepartmentMetricCard
              key={deptKey}
              deptKey={deptKey}
              stats={stats?.[deptKey]}
              isSelected={selectedDept === deptKey}
              onClick={() => {
                if (isAdmin) {
                  setSelectedDept(prev => prev === deptKey ? 'all' : deptKey);
                }
              }}
            />
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
