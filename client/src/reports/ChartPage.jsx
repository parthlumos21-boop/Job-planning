import { useEffect, useState } from 'react';
import api from '../services/api';
import { Loader2, Trash2 } from 'lucide-react';
import JobChart from './JobChart';
import { buildJobProgressData, DEPARTMENT_PROGRESS } from '../jobs/jobProgress';

export default function ChartPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackedIds, setTrackedIds] = useState([]);

  const fetchData = async () => {
    try {
      const ids = JSON.parse(localStorage.getItem('savedChartJobIds') || '[]');
      setTrackedIds(ids);

      if (ids.length > 0) {
        const res = await api.get('/jobs');
        const allJobs = Array.isArray(res.data) ? res.data : (res.data.jobs || []);
        
        const filtered = allJobs.filter(j => ids.map(String).includes(String(j._id || j.id)));
        const detailedJobs = await Promise.all(
          filtered.map(async (job) => {
            const jobId = job._id || job.id;
            const detailRes = await api.get(`/jobs/${jobId}`);
            return detailRes.data;
          })
        );
        setJobs(detailedJobs);
      } else {
        setJobs([]);
      }
    } catch (err) {
      console.error('Failed to fetch jobs for chart:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRemoveTracked = (idToRemove) => {
    const ids = trackedIds.filter(id => id !== idToRemove);
    localStorage.setItem('savedChartJobIds', JSON.stringify(ids));
    setTrackedIds(ids);
    setJobs(jobs.filter(j => (j._id || j.id) !== idToRemove));
  };

  if (loading && jobs.length === 0 && trackedIds.length > 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Tracked Job Charts</h1>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 text-center">
          <p className="text-slate-500">No jobs are currently tracked.</p>
          <p className="text-sm text-slate-400 mt-2">Go to "View Jobs" and click the Chart icon on any row to add it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {jobs.map((job, index) => {
            const jobId = job._id || job.id;
            const chartData = buildJobProgressData(job);
            return (
              <div key={index} className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Job: {job.jobNo}</h2>
                    <p className="text-sm text-slate-500">{job.projectName} | Panel: {job.panelName}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveTracked(jobId)}
                    className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors cursor-pointer"
                    title="Remove from charts"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <JobChart data={chartData} />
                
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm text-left text-slate-500">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                      <tr>
                        <th className="px-4 py-2">Department</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEPARTMENT_PROGRESS.map(dept => (
                        <tr key={dept.key} className="border-b border-slate-100">
                          <td className="px-4 py-2 font-medium text-slate-900">{dept.name}</td>
                          <td className="px-4 py-2">
                            {(job.departmentStatus || {})[dept.key] || 'pending'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
