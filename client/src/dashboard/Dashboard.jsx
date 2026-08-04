import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, Briefcase, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';

const DEPT_DISPLAY_NAMES = {
  marketing: 'Marketing',
  design: 'Design – Electrical',
  mechanical: 'Design – Mechanical',
  purchase: 'Procurement',
  production: 'Production & QC & Dispatch',
  dispatch: 'Production & QC & Dispatch',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin' || user?.role === 'executive';
  const isMarketingOrAdmin = user?.departments?.includes('marketing') || isAdmin;
  const isKeval = user?.username?.toLowerCase() === 'keval v shah';
  const primaryDept = user?.departments?.[0] || '';
  const deptName = isAdmin ? 'All Departments' : (DEPT_DISPLAY_NAMES[primaryDept] || primaryDept);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [jobsRes, statsRes] = await Promise.all([
        api.get('/jobs'),
        api.get('/jobs/stats')
      ]);
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {!isAdmin && <p className="text-gray-500 text-sm mt-1">{deptName}</p>}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="space-y-8">
        {isAdmin && stats?.overall && (
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">Overall</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatsCard title="Total Jobs" value={stats.overall.total} icon={<Briefcase size={28} />} color="blue" />
              <StatsCard title="In Progress" value={stats.overall.inProgress} icon={<Loader2 size={28} />} color="orange" />
            </div>
          </div>
        )}

        {['marketing', 'design', 'mechanical', 'purchase', 'production'].map(deptKey => {
          if (!isAdmin && primaryDept !== deptKey && !(primaryDept === 'dispatch' && deptKey === 'production')) {
            return null;
          }
          const deptStats = stats?.[deptKey] || { total: 0, inProgress: 0 };
          return (
            <div key={deptKey}>
              <h2 className="text-lg font-semibold text-slate-700 mb-3">{DEPT_DISPLAY_NAMES[deptKey]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatsCard title="Total Jobs" value={deptStats.total} icon={<Briefcase size={28} />} color="blue" />
                <StatsCard title="In Progress" value={deptStats.inProgress} icon={<Loader2 size={28} />} color="orange" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
