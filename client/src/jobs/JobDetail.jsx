import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { ArrowLeft, FileSpreadsheet, FileText, Loader2, Download, BarChart2 } from 'lucide-react';
import { buildJobProgressData, DEPARTMENT_PROGRESS } from './jobProgress';
import ExcelTable from '../components/ExcelTable';
import JobChart from '../reports/JobChart';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const progressTableRows = (progressData) => progressData.map((item) => ({
  department: item.name,
  filled: item.filled,
  remaining: Math.max(item.total - item.filled, 0),
  total: item.total,
  progress: `${item.progress}%`
}));

const safeFileName = (name) => {
  return String(name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const chartRef = React.useRef(null);

  const isKeval = user?.username?.toLowerCase() === 'keval v shah';
  const isAdmin = user?.role === 'admin' || user?.role === 'executive';
  const hasMarketingAccess = isKeval || isAdmin || user?.departments?.includes('marketing');
  const hasOtherAccess = isKeval || isAdmin || (user?.departments && user.departments.some(d => d !== 'marketing'));

  useEffect(() => {
    fetchJob();
    // eslint-disable-next-line
  }, [id]);

  const fetchJob = async () => {
    try {
      const res = await api.get(`/jobs/${id}`);
      setJob(res.data);
    } catch (err) {
      console.error('Failed to fetch job:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJobUpdated = (jobId, department, field, value) => {
    setJob(prevJob => {
      const isCore = department === 'marketing';
      if (isCore) {
        return { ...prevJob, [field]: value };
      }
      return {
        ...prevJob,
        allDepartmentsData: {
          ...(prevJob.allDepartmentsData || {}),
          [department]: {
            ...((prevJob.allDepartmentsData || {})[department] || {}),
            [field]: value
          }
        },
        fields: {
          ...(prevJob.fields || {}),
          [department]: {
            ...((prevJob.fields || {})[department] || {}),
            [field]: value
          }
        }
      };
    });
  };

  const downloadProgressPDF = () => {
    if (!job) return;
    const progressData = buildJobProgressData(job);
    const rows = progressTableRows(progressData);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    
    const renderPdf = (imgData = null) => {
      if (imgData) {
        doc.addImage(imgData, 'PNG', pageWidth / 2 - 15, 10, 30, 30);
      }
      
      doc.setFontSize(21);
      doc.text('Real-Time Job Progress', pageWidth / 2, 50, { align: 'center' });
      doc.setFontSize(14);
      doc.text(`Job: ${job.jobNo || ''} - ${job.panelName || ''}`, pageWidth / 2, 60, { align: 'center' });
      doc.text(`Exported: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, 70, { align: 'center' });
      
      doc.autoTable({
        startY: 80,
        head: [['Department', 'Filled', 'Remaining', 'Total', 'Complete']],
        body: rows.map((row) => [row.department, row.filled, row.remaining, row.total, row.progress]),
        styles: { fontSize: 14, cellPadding: 6 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });
      doc.save(`job_progress_${safeFileName(job.jobNo || id)}.pdf`);
    };

    const img = new Image();
    img.src = '/21.png';
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      renderPdf(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      console.warn('Failed to load logo for PDF');
      renderPdf();
    };
  };

  const handleDownloadChart = async () => {
    if (!chartRef.current) return;
    try {
      const url = await toPng(chartRef.current, { pixelRatio: 2, style: { background: 'white' } });
      const link = document.createElement('a');
      link.download = `Job_${job?.jobNo || 'Status'}_Chart.png`;
      link.href = url;
      link.click();
    } catch (err) {
      console.error('Failed to download chart', err);
      alert('Failed to download chart image');
    }
  };

  const handleDownloadChartPDF = async () => {
    if (!chartRef.current) return;
    try {
      const node = chartRef.current;
      const imgData = await toPng(node, { pixelRatio: 2, style: { background: 'white' } });
      const pdf = new jsPDF({
        orientation: node.offsetWidth > node.offsetHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [node.offsetWidth, node.offsetHeight]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, node.offsetWidth, node.offsetHeight);
      pdf.save(`Job_${job?.jobNo || 'Status'}_Chart.pdf`);
    } catch (err) {
      console.error('Failed to download chart as PDF', err);
      alert('Failed to download chart PDF');
    }
  };

  const downloadProgressExcel = async () => {
    if (!job) return;
    try {
      const jobId = job.id || job._id;
      const res = await api.get(`/export/xlsx?ids=${jobId}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `job_${safeFileName(job.jobNo || jobId)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download Excel report');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Job not found</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-600 hover:underline">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-3">
              <span>{job.jobNo || 'No Job No'}</span>
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-0.5">{job.projectName} • {job.panelName}</p>
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={downloadProgressExcel}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-sm rounded-lg border border-emerald-200 transition-colors shadow-sm"
          >
            <FileSpreadsheet size={16} />
            <span>Export XLS</span>
          </button>
          <button
            onClick={downloadProgressPDF}
            className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 font-semibold text-sm rounded-lg border border-red-200 transition-colors shadow-sm"
          >
            <FileText size={16} />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {hasMarketingAccess && (
        <ExcelTable jobs={[job]} onJobUpdated={handleJobUpdated} user={user} hideActions={true} filterDepartments={['marketing']} />
      )}

      {isKeval && (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <BarChart2 size={24} />
            <span>Progress Chart</span>
          </h2>
          <div className="flex space-x-2">
            <button
              onClick={handleDownloadChart}
              className="flex items-center space-x-2 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-sm rounded-lg border border-blue-200 transition-colors shadow-sm"
              title="Download as PNG"
            >
              <Download size={14} />
              <span>PNG</span>
            </button>
            <button
              onClick={handleDownloadChartPDF}
              className="flex items-center space-x-2 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 font-semibold text-sm rounded-lg border border-red-200 transition-colors shadow-sm"
              title="Download as PDF"
            >
              <FileText size={14} />
              <span>PDF</span>
            </button>
          </div>
        </div>
        
        <div className="bg-white p-4 -mx-4 sm:mx-0">
          <div ref={chartRef} className="bg-white">
            <JobChart data={buildJobProgressData(job)} />
          </div>

          <div className="mt-8 overflow-x-auto">
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
      </div>
      )}

      {hasOtherAccess && (
        <ExcelTable jobs={[job]} onJobUpdated={handleJobUpdated} user={user} hideActions={true} filterDepartments={['design', 'mechanical', 'purchase', 'production', 'dispatch', 'qc']} />
      )}
    </div>
  );
}
