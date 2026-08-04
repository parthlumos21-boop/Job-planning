import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import api from '../services/api';
import ExcelTable from '../components/ExcelTable';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const DEPARTMENTS = [
  { key: 'marketing', name: 'Marketing', color: 'bg-yellow-500', colorText: 'text-yellow-700' },
  { key: 'design', name: 'Design – Electrical', color: 'bg-sky-500', colorText: 'text-sky-700' },
  { key: 'mechanical', name: 'Design – Mechanical', color: 'bg-red-500', colorText: 'text-red-700' },
  { key: 'purchase', name: 'Procurement', color: 'bg-green-500', colorText: 'text-green-700' },
  { key: 'production', name: 'Production & QC & Dispatch', color: 'bg-orange-500', colorText: 'text-orange-700' },
];

const REPORT_DEPARTMENTS = [
  { key: 'marketing', name: 'Marketing', color: 'bg-red-300', colorText: 'text-red-800', rgb: [252, 165, 165] },
  { key: 'design', name: 'Design - Electrical', color: 'bg-purple-300', colorText: 'text-purple-800', rgb: [216, 180, 254] },
  { key: 'mechanical', name: 'Design - Mechanical', color: 'bg-blue-300', colorText: 'text-blue-800', rgb: [147, 197, 253] },
  { key: 'purchase', name: 'Procurement', color: 'bg-green-300', colorText: 'text-green-800', rgb: [134, 239, 172] },
  { key: 'production', name: 'Production & QC', color: 'bg-cyan-300', colorText: 'text-cyan-800', rgb: [103, 232, 249] },
  { key: 'dispatch', name: 'Dispatch', color: 'bg-cyan-300', colorText: 'text-cyan-800', rgb: [103, 232, 249] },
];

const validUserName = (value) => {
  const name = String(value || '').trim();
  if (!name) return false;
  return !['other', 'others', 'n/a', 'na', 'none', 'system', '-', '--'].includes(name.toLowerCase());
};

const departmentUsers = (job, departmentKey) => {
  const names = job.engineers?.[departmentKey] || [];
  return [...new Set((Array.isArray(names) ? names : []).filter(validUserName))].join(', ');
};

export default function Reports() {
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(null);
  const [rawJobs, setRawJobs] = useState([]);
  
  const fetchJobs = async () => {
    try {
      const res = await api.get('/jobs');
      const allJobs = Array.isArray(res.data) ? res.data : (res.data.jobs || []);
      setRawJobs(allJobs);
    } catch (err) {
      console.error('Failed to fetch jobs for reports table', err);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const downloadExcel = async (department) => {
    setDownloading(`excel-${department || 'all'}`);
    try {
      const res = await api.get(`/export/xlsx${department ? `?department=${department}` : ''}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `job_register_${department || 'all'}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download Excel report');
    } finally {
      setDownloading(null);
    }
  };

  const downloadPDF = async (departmentKey) => {
    setDownloading(`pdf-${departmentKey}`);
    try {
      const res = await api.get(`/jobs${departmentKey ? `?department=${departmentKey}` : ''}`);
      const summaryJobs = res.data.jobs || [];
      const jobs = await Promise.all(
        summaryJobs.map(async (job) => {
          const jobId = job._id || job.id;
          const detail = await api.get(`/jobs/${jobId}`);
          return detail.data;
        })
      );
      const deptInfo = REPORT_DEPARTMENTS.find((dept) => dept.key === departmentKey) || REPORT_DEPARTMENTS[0];

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const docTitle = departmentKey
        ? `${deptInfo.name.toUpperCase()} REGISTER`
        : 'MASTER PLANNING & TRACKING REGISTER';

      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(16);
      doc.text("JOB PLANNING & TRACKING REGISTER", pageWidth / 2, 10, { align: 'center' });
      doc.setFontSize(14);
      doc.text(docTitle, pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Exported on: ${new Date().toLocaleString('en-IN')}`, 14, 24);

      let headers = [];
      let data = [];

      if (departmentKey === 'marketing') {
        headers = [
          'Sr No', 'Department', 'Users', 'Job No', 'Panel Name', 'Project Name', 'Type of Panel',
          'Responsible Engg.', 'PO Date', 'Del. Date', 'Del. Address'
        ];
        data = jobs.map((j, i) => {
          const mf = j.fields?.marketing || {};
          return [
            i + 1,
            deptInfo.name,
            departmentUsers(j, departmentKey),
            j.jobNo,
            j.panelName,
            j.projectName,
            mf['Type of Panel'] || j.ttl || '',
            mf['Responsible Engg. Name'] || '',
            mf['Purchase Order Date'] || '',
            mf['Delivery Date as per P.O.'] || '',
            mf['Delivery Address'] || ''
          ];
        });
      } else if (departmentKey === 'design') {
        headers = [
          'Sr No', 'Department', 'Users', 'Job No', 'Panel Name', 'Project Name',
          'BOM Release', 'G.A. Release', 'Drawing Prepare By',
          'SO No.', 'BOM Prepare Eng'
        ];
        data = jobs.map((j, i) => {
          const df = j.fields?.design || {};
          return [
            i + 1,
            deptInfo.name,
            departmentUsers(j, departmentKey),
            j.jobNo,
            j.panelName,
            j.projectName,
            df['BOM Released To Purchase'] || '',
            df['Fabrication Release Date'] || '',
            df['Drawing Prepare By'] || '',
            df['SO No. of ERP System'] || '',
            df['BOM Prepare Engnieer Name'] || ''
          ];
        });
      } else if (departmentKey === 'mechanical') {
        headers = [
          'Sr No', 'Department', 'Users', 'Job No', 'Panel Name', 'Fabricator Name',
          'Punching Start/End', 'Bending Start/End', 'Welding Start/End',
          'Assembly Start/End'
        ];
        data = jobs.map((j, i) => {
          const mf = j.fields?.mechanical || {};
          return [
            i + 1,
            deptInfo.name,
            departmentUsers(j, departmentKey),
            j.jobNo,
            j.panelName,
            mf['Swati / Outsource Fabricator Name'] || '',
            `${mf['Punching Start Date'] || '—'} / ${mf['Punching Complete Date'] || '—'}`,
            `${mf['Bending Start Date'] || '—'} / ${mf['Bending Complete Date'] || '—'}`,
            `${mf['Welding Start Date'] || '—'} / ${mf['Welding Complete Date'] || '—'}`,
            `${mf['Panel Assembly Start Date'] || '—'} / ${mf['Panel Assembly Complete Date'] || '—'}`
          ];
        });
      } else if (departmentKey === 'purchase') {
        headers = [
          'Sr No', 'Department', 'Users', 'Job No', 'Panel Name', 'Project Name',
          'Switchgear PO', 'Switchgear Date', 'Misc PO', 'Misc Date'
        ];
        data = jobs.map((j, i) => {
          const pf = j.fields?.purchase || {};
          return [
            i + 1,
            deptInfo.name,
            departmentUsers(j, departmentKey),
            j.jobNo,
            j.panelName,
            j.projectName,
            pf['Switchgear PO Number'] || '',
            pf['Switchgear Date'] || '',
            pf['Misc PO Number'] || '',
            pf['Misc Date'] || ''
          ];
        });
      } else {
        // Production, QC & Dispatch combined
        headers = [
          'Sr No', 'Department', 'Users', 'Job No', 'Panel Name', 'Fitter',
          'Wireman', 'Testing Eng', 'Inspection Date',
          'Packing Complete', 'Dispatch Date'
        ];
        data = jobs.map((j, i) => {
          const pf = j.fields?.production || {};
          const df = j.fields?.dispatch || {};
          return [
            i + 1,
            deptInfo.name,
            departmentUsers(j, departmentKey),
            j.jobNo,
            j.panelName,
            pf['Responsible Fitter'] || '',
            pf['Responsible Wireman'] || '',
            pf['Testing Done By Engineer'] || '',
            pf['Actual Inspection Date'] || '',
            df['Packing Complete Date'] || '',
            df['Dispatch Date'] || ''
          ];
        });
      }

      autoTable(doc, {
        head: [headers],
        body: data,
        startY: 30,
        styles: { fontSize: 8 },
        headStyles: { fillColor: deptInfo.rgb, textColor: 255 },
        theme: 'striped'
      });

      doc.save(`job_register_${departmentKey || 'all'}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF report');
    } finally {
      setDownloading(null);
    }
  };

  const isKeval = user?.username?.toLowerCase() === 'keval v shah';
  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || isKeval;
  const primaryDept = user?.departments?.[0];

  const allowedDepartments = isAdmin 
    ? REPORT_DEPARTMENTS 
    : REPORT_DEPARTMENTS.filter(d => d.key === primaryDept || (primaryDept === 'qc' || primaryDept === 'dispatch' ? d.key === 'production' || d.key === 'dispatch' : false));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Download department-wise Excel and PDF reports</p>
      </div>

      {/* Excel Export */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Excel Export</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isAdmin && (
              <button
                onClick={() => downloadExcel('')}
                disabled={!!downloading}
                className="flex items-center space-x-3 p-4 rounded-lg border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left"
              >
                {downloading === 'excel-all' ? (
                  <Loader2 className="animate-spin text-blue-600" size={24} />
                ) : (
                  <FileSpreadsheet size={24} className="text-blue-600" />
                )}
                <div>
                  <div className="font-medium text-gray-900">All Departments</div>
                  <div className="text-xs text-gray-500">Complete register spreadsheet</div>
                </div>
              </button>
            )}
            {allowedDepartments.map(dept => (
              <button
                key={dept.key}
                onClick={() => downloadExcel(dept.key)}
                disabled={!!downloading}
                className="flex items-center space-x-3 p-4 rounded-lg border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left"
              >
                {downloading === `excel-${dept.key}` ? (
                  <Loader2 className="animate-spin text-blue-600" size={24} />
                ) : (
                  <div className={`w-6 h-6 rounded ${dept.color}`} />
                )}
                <div>
                  <div className="font-medium text-gray-900">{dept.name}</div>
                  <div className="text-xs text-gray-500">Excel spreadsheet</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PDF Export */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">PDF Export</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allowedDepartments.map(dept => (
              <button
                key={dept.key}
                onClick={() => downloadPDF(dept.key)}
                disabled={!!downloading}
                className="flex items-center space-x-3 p-4 rounded-lg border-2 border-gray-200 hover:border-red-300 hover:bg-red-50 transition-all text-left"
              >
                {downloading === `pdf-${dept.key}` ? (
                  <Loader2 className="animate-spin text-red-600" size={24} />
                ) : (
                  <FileText size={24} className="text-red-600" />
                )}
                <div>
                  <div className="font-medium text-gray-900">{dept.name} PDF</div>
                  <div className="text-xs text-gray-500">Document report</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      
    </div>
  );
}
