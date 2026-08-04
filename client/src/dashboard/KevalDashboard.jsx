  import { useEffect, useState } from 'react';
import api from '../services/api';
import { Loader2, Activity } from 'lucide-react';

const TRACKED_DEPARTMENTS = [
  {
    name: 'Marketing',
    users: ['swatisales', 'swatisales2', 'mktadmin']
  },
  {
    name: 'Design- Electrical',
    users: ['swatidesign', 'swatidesign2', 'designadmin']
  },
  {
    name: 'Design- Mechanical',
    users: ['mechdesign1', 'mechdesign2', 'machinedesign']
  },
  {
    name: 'Procurement',
    users: ['swatipurchase', 'swatipurchase2', 'purchaseadmin']
  },
  {
    name: 'Production & QC & Dispatch',
    users: ['swatiproduction', 'swatiqc', 'prodadmin']
  }
];

export default function KevalDashboard() {
  const [data, setData] = useState([]);
  const [rawJobs, setRawJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(new Date());

  const fetchLiveWork = async () => {
    try {
      const res = await api.get('/jobs');
      const allJobs = Array.isArray(res.data) ? res.data : (res.data.jobs || []);
      setRawJobs(allJobs);
      
      const processed = TRACKED_DEPARTMENTS.map(dept => {
        const userStats = dept.users.map(username => {
          // Find jobs related to this user
          const userJobs = allJobs.filter(job => {
            const isCreator = String(job.createdBy || '').toLowerCase() === username.toLowerCase();
            const isResponsible = String(job.responsibleEnggName || '').toLowerCase() === username.toLowerCase();
            return isCreator || isResponsible;
          });

          // Sort by latest (assuming higher ID means newer, or use created/updated timestamps if available)
          const sortedJobs = userJobs.sort((a, b) => (b.id || 0) - (a.id || 0));
          const latestJob = sortedJobs[0];
          
          return {
            username,
            activeJobs: userJobs.length,
            lastActivity: latestJob ? latestJob.date || 'Recent' : 'No Activity',
            latestJobNo: latestJob ? latestJob.jobNo : 'N/A'
          };
        });

        return {
          ...dept,
          userStats
        };
      });

      setData(processed);
      setLastFetch(new Date());
    } catch (err) {
      console.error('Failed to fetch live work', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveWork();
    const interval = setInterval(fetchLiveWork, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleJobUpdated = () => {
    fetchLiveWork();
  };

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Department Activity</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time status monitor</p>
        </div>
        <div className="flex items-center text-sm text-slate-500 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
          <Activity size={16} className="text-blue-500 mr-2" />
          Live updates active (Last checked: {lastFetch.toLocaleTimeString()})
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {data.map((dept, index) => (
          <div key={index} className="bg-white shadow-sm rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-semibold text-slate-800">{dept.name}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Active Jobs</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Latest Activity</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {dept.userStats.map((stat, sIndex) => (
                    <tr key={sIndex} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {stat.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                        {stat.activeJobs > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {stat.activeJobs} Jobs
                          </span>
                        ) : (
                          <span className="text-slate-400">0 Jobs</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {stat.lastActivity !== 'No Activity' ? (
                          <div className="flex flex-col">
                            <span>{stat.lastActivity}</span>
                            <span className="text-xs text-slate-400">Job: {stat.latestJobNo}</span>
                          </div>
                        ) : (
                          'No Activity'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
