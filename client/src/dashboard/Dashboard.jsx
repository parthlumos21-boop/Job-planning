import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle, Briefcase, Clock, CheckCircle2, Building,
  Search, Filter, RefreshCw, X
} from 'lucide-react';
import StatsCard from '../components/StatsCard';
import DepartmentMetricCard from '../components/DepartmentMetricCard';
import JobCard from '../components/JobCard';

const TRACKED_DEPTS = ['marketing', 'design', 'mechanical', 'purchase', 'production'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // 'all', 'pending', 'completed'

  const isAdmin = user?.role === 'admin' || user?.role === 'executive';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [jobsRes, statsRes] = await Promise.all([
        api.get('/jobs'),
        api.get('/jobs/stats')
      ]);

      // Handle payload structure { count: N, jobs: [...] } or array
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

  // Filtered jobs memo
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Search filter
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesJobNo = String(job.jobNo || '').toLowerCase().includes(q);
        const matchesClient = String(job.clientName || '').toLowerCase().includes(q);
        const matchesPanel = String(job.panelName || '').toLowerCase().includes(q);
        const matchesProject = String(job.projectName || '').toLowerCase().includes(q);
        const matchesEngg = String(job.responsibleEnggName || '').toLowerCase().includes(q);
        if (!matchesJobNo && !matchesClient && !matchesPanel && !matchesProject && !matchesEngg) {
          return false;
        }
      }

      // Department filter
      if (selectedDept !== 'all') {
        const visibleDepts = job.visibleToDepartments || [];
        const hasDeptData = (job.fields && job.fields[selectedDept]) || (job.targetDepartment === selectedDept);
        if (!visibleDepts.includes(selectedDept) && !hasDeptData) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== 'all') {
        const isDispatched = (job.departmentStatus || {}).dispatch === 'completed';
        if (selectedStatus === 'completed' && !isDispatched) return false;
        if (selectedStatus === 'pending' && isDispatched) return false;
      }

      return true;
    });
  }, [jobs, searchTerm, selectedDept, selectedStatus]);

  // Unique clients count
  const uniqueClientsCount = useMemo(() => {
    const clients = new Set(jobs.map(j => j.clientName).filter(Boolean));
    return clients.size;
  }, [jobs]);

  const totalJobsCount = stats?.overall?.total || jobs.length;
  const completedJobsCount = stats?.overall?.completed || jobs.filter(j => (j.departmentStatus || {}).dispatch === 'completed').length;
  const inProgressJobsCount = stats?.overall?.pending || (totalJobsCount - completedJobsCount);

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
            Real-time departmental workflow tracking & master job register
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/jobs/new')}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all text-sm"
          >
            <PlusCircle size={17} />
            Create New Job
          </button>
        </div>
      </div>

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

      {/* Department Pipeline Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h2 className="text-base font-bold text-slate-800">Department Workflow Pipeline</h2>
            <p className="text-xs text-slate-500">Click any card to filter jobs by that department</p>
          </div>
          {selectedDept !== 'all' && (
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
              onClick={() => setSelectedDept(prev => prev === deptKey ? 'all' : deptKey)}
            />
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Job No, Client, Panel Name, Project, Engineer..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl self-start md:self-auto shrink-0">
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedStatus === 'all'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All Jobs ({jobs.length})
            </button>
            <button
              onClick={() => setSelectedStatus('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedStatus === 'pending'
                  ? 'bg-white text-amber-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => setSelectedStatus('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedStatus === 'completed'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Completed
            </button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(selectedDept !== 'all' || selectedStatus !== 'all' || searchTerm) && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span className="font-semibold">Active Filters:</span>
            {selectedDept !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium border border-blue-200">
                Dept: {selectedDept}
                <X size={12} className="cursor-pointer" onClick={() => setSelectedDept('all')} />
              </span>
            )}
            {selectedStatus !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-medium border border-amber-200">
                Status: {selectedStatus}
                <X size={12} className="cursor-pointer" onClick={() => setSelectedStatus('all')} />
              </span>
            )}
            {searchTerm && (
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                "{searchTerm}"
                <X size={12} className="cursor-pointer" onClick={() => setSearchTerm('')} />
              </span>
            )}
            <span className="ml-auto text-slate-400 font-medium">
              Showing {filteredJobs.length} of {jobs.length} jobs
            </span>
          </div>
        )}
      </div>

      {/* Master Job Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-slate-800 tracking-tight">
            Job Cards
            <span className="ml-2 text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
              {filteredJobs.length}
            </span>
          </h2>
        </div>

        {loading ? (
          /* Skeleton Loader Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs animate-pulse space-y-4">
                <div className="flex justify-between">
                  <div className="h-5 w-16 bg-slate-200 rounded-md" />
                  <div className="h-5 w-24 bg-slate-200 rounded-full" />
                </div>
                <div className="h-5 w-3/4 bg-slate-200 rounded-md" />
                <div className="h-4 w-1/2 bg-slate-100 rounded-md" />
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="h-8 bg-slate-100 rounded-lg" />
                  <div className="h-8 bg-slate-100 rounded-lg" />
                </div>
                <div className="h-10 bg-slate-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center max-w-md mx-auto my-8">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400 mb-4">
              <Search size={28} />
            </div>
            <h3 className="text-base font-bold text-slate-800">No matching jobs found</h3>
            <p className="text-xs text-slate-500 mt-1 mb-6">
              Try adjusting your search terms, changing the department filter, or create a new job.
            </p>
            <div className="flex justify-center gap-3">
              {(searchTerm || selectedDept !== 'all' || selectedStatus !== 'all') && (
                <button
                  onClick={() => { setSearchTerm(''); setSelectedDept('all'); setSelectedStatus('all'); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Clear All Filters
                </button>
              )}
              <button
                onClick={() => navigate('/jobs/new')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                + New Job
              </button>
            </div>
          </div>
        ) : (
          /* Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onView={id => navigate(`/jobs/${id}`)}
                onEdit={id => navigate(`/jobs/edit/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
