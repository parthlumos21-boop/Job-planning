import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { ArrowLeft, Save, Loader2, Search, Filter } from 'lucide-react';
import { DEPARTMENT_USER_OPTIONS } from './departmentUserOptions';
import {
  CUSTOMER_NAME_OPTIONS,
  INDUSTRY_OPTIONS,
  PANEL_NAME_OPTIONS,
  PANEL_TYPE_OPTIONS
} from './jobDropdownOptions';
import { getAssociatedDateField } from './jobProgress';
const TRANSPORT_OPTIONS = ['Inclusive', 'Exclusive', 'Others'];
const PACKING_OPTIONS = ['Polythene', 'Crate Wooden', 'Sea Worthy', 'Export', 'Others'];

const FIELD_DEPARTMENT_MAP = {
  marketing: ['Transportation', 'Packing', 'Inspection Call date', 'Contact Number', 'Marketing Remarks'],
  design: [
    'Design Planned Date', 'Drawing Submission Date', 'Drawing Submission Engineer Name',
    'Rev R0 PDF', 'Rev R0 PDF Name of Person',
    'Rev R1 PDF', 'Rev R1 PDF Name of Person',
    'Rev R2 PDF', 'Rev R2 PDF Name of Person',
    'Final Approved Drawings Received Date', 'BOM Released To Purchase',
    'SO No. of ERP System', 'BOM Prepare Engnieer Name'
  ],
  purchase: ['Switchgear PO Number', 'Switchgear Date', 'Misc PO Number', 'Misc Date'],
  mechanical: [
    'Fabrication Release Date', 'Swati / Oursource Fabricator Name',
    'Fabrication Prepare Engnieer Name', 'Door Details Sent Date',
    'Door Details Prepare Engineer Name', 'EXECUTION FILE DATE',
    'EXECUTION (PDF) PREPARED ENGINEER', 'AS BUILT SUBMISSION DATE',
    'AS BUILT PREPARED BY ENGINEER (PRODUCTION)',
    'AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)',
    'Drawing start Date', 'Drawing Complete Date', 'Drawign Prepare',
    'Door and Service Plate', 'Drafting File Handover Date',
    'DFT Prepare Engineer', 'Release to programme', 'Programme Start date',
    'Programme End date', 'Programmer Engineer Name', 'Programming release to',
    'Puching & Laser Start', 'Puching & Laser End', 'Bending start date',
    'Bending complete', 'Welding start date', 'Welding complete',
    'Name of Fabricator', 'Name of Fabrication Engineer', 'Release to Painting',
    'Recived to painting', 'Name of painter', 'Panel Assembly Start',
    'Panel Assembly Complete', 'Name of Assembler',
    'Painting and Asembley Responsible Job engg. Name'
  ],
  production: [
    'Responsible Job Engineer', 'Busbar Work Start Date',
    'Busbar Work Complete Date', 'Responsible Fitter', 'Wiring Start Date',
    'Wiring Complete Date', 'Responsible Wireman', 'Testing Start Date',
    'Testing Complete Date', 'Testing Done By Engineer',
    'Actual Inspection Date', 'Compliance / Dispatch Clearance Date'
  ],
  dispatch: [
    'Packing Start Date', 'Packing Complete Date',
    'Name of Responsible Person Checked Before Packing', 'Dispatch Date'
  ]
};

const FIELD_TO_DEPARTMENT = Object.entries(FIELD_DEPARTMENT_MAP).reduce((acc, [dept, fields]) => {
  fields.forEach(field => {
    acc[field] = dept;
  });
  return acc;
}, {});

const departmentForField = (field, fallbackDept) => {
  if (/^Rev R\d+ /.test(field) || /^Client Submission Date R\d+$/.test(field)) {
    return 'design';
  }
  return FIELD_TO_DEPARTMENT[field] || fallbackDept;
};

const buildDepartmentPayload = (fields, fallbackDept, splitByDepartment) => {
  return Object.entries(fields).reduce((acc, [field, value]) => {
    if (value === undefined || value === null || value === '') return acc;
    const dept = splitByDepartment ? departmentForField(field, fallbackDept) : fallbackDept;
    acc[dept] = acc[dept] || {};
    acc[dept][field] = value;
    return acc;
  }, {});
};

const normalizeDatesInObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const newObj = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key in newObj) {
    if (typeof newObj[key] === 'string') {
      const val = newObj[key];
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(val)) {
        const [d, m, y] = val.split('.');
        newObj[key] = `${y}-${m}-${d}`;
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
        const [d, m, y] = val.split('/');
        newObj[key] = `${y}-${m}-${d}`;
      } else if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
        newObj[key] = val.substring(0, 10);
      }
    } else if (typeof newObj[key] === 'object' && newObj[key] !== null) {
      newObj[key] = normalizeDatesInObject(newObj[key]);
    }
  }
  return newObj;
};

const EMPTY_CORE = {
  panelName: '',
  jobNo: '',
  projectName: '',
  clientName: '',
  responsibleEnggName: '',
  poDate: '',
  dataGivenToDesign: '',
  typeOfIndustries: '',
  qty: 1,
  incomerRating: '',
  typeOfPanel: '',
  poNo: '',
  deliveryPeriod: '',
  deliveryDate: '',
  deliveryAddress: '',
  contactPerson: ''
};

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const valueByAliases = (source, aliases) => {
  if (!source || typeof source !== 'object') return '';
  for (const alias of aliases) {
    const exactValue = source[alias];
    if (hasValue(exactValue)) return exactValue;
    const looseKey = Object.keys(source).find((key) => key.trim().toLowerCase() === alias.trim().toLowerCase());
    if (looseKey && hasValue(source[looseKey])) return source[looseKey];
  }
  return '';
};

const firstValue = (...values) => values.find(hasValue) ?? '';

const normalizeDateValue = (value) => {
  if (!hasValue(value)) return '';
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (!match) return text;
  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const marketingCoreFromJob = (job) => {
  const marketing = job?.marketingFields || job?.fields?.marketing || {};
  return {
    panelName: firstValue(job?.panelName, valueByAliases(marketing, ['Name of Panel', 'Panel Name'])),
    jobNo: firstValue(job?.jobNo, valueByAliases(marketing, ['Job No.', 'Job No', 'Job Number'])),
    projectName: firstValue(job?.projectName, valueByAliases(marketing, ['Project Name'])),
    clientName: firstValue(job?.clientName, valueByAliases(marketing, ['Customer Name', 'Client Name'])),
    responsibleEnggName: firstValue(job?.responsibleEnggName, valueByAliases(marketing, ['Responsible Engg. Name', 'Responsible Engineer'])),
    poDate: normalizeDateValue(firstValue(job?.poDate, valueByAliases(marketing, ['Purchase Order Date']))),
    dataGivenToDesign: normalizeDateValue(firstValue(job?.dataGivenToDesign, valueByAliases(marketing, ['Data Given To Design', 'Data Given To Design Dept.']))),
    typeOfIndustries: firstValue(job?.typeOfIndustries, valueByAliases(marketing, ['Type of Industries', 'Industry Type'])),
    qty: firstValue(job?.qty, valueByAliases(marketing, ['Qty.', 'Qty', 'Quantity'])) || 1,
    incomerRating: firstValue(job?.incomerRating, valueByAliases(marketing, ['Incomer Rating'])),
    typeOfPanel: firstValue(job?.typeOfPanel, valueByAliases(marketing, ['Type of Panel', 'Type of Panel TTA/NON TTA'])),
    poNo: firstValue(job?.poNo, valueByAliases(marketing, ['Purchase Order', 'Purchase Order Number'])),
    deliveryPeriod: firstValue(job?.deliveryPeriod, valueByAliases(marketing, ['Delivery Period', 'Delivery Period as per P.O'])),
    deliveryDate: normalizeDateValue(firstValue(job?.deliveryDate, valueByAliases(marketing, ['Delivery Date', 'Delivery Date as per P.O.']))),
    deliveryAddress: firstValue(job?.deliveryAddress, valueByAliases(marketing, ['Delivery Address'])),
    contactPerson: firstValue(job?.contactPerson, valueByAliases(marketing, ['Contact Person', 'Contact Person & Ph. No.']))
  };
};

const REQUIRED_CORE_FIELDS = [
  { key: 'jobNo', label: 'Job Number' },
  { key: 'panelName', label: 'Panel Name' },
  { key: 'typeOfIndustries', label: 'Industry Type' },
  { key: 'projectName', label: 'Project Name' },
  { key: 'responsibleEnggName', label: 'Responsible Engineer' }
];

const REQUIRED_DEPARTMENT_FIELDS = {
  design: [
    { key: 'BOM Prepare Engnieer Name', label: 'BOM Prepare Engnieer Name' },
    { key: 'Drawing Submission Engineer Name', label: 'Drawing Submission Engineer Name' },
    ...[0, 1, 2].flatMap((rev) => [
      ...['GA', 'SLD', 'BOQ', 'CONTROL'].map((doc) => ({
        key: `Rev R${rev} ${doc} Name of Peson`,
        label: `Rev R${rev} ${doc} Name of Peson`
      })),
      {
        key: `Rev R${rev} PDF Name of Peson`,
        label: `Rev R${rev} PDF Name of Peson`,
        aliases: [`Rev R${rev} PDF Name`, `Rev R${rev} PDF Name of Person`]
      }
    ])
  ],
  mechanical: [
    { key: 'Fabrication Prepare Engnieer Name', label: 'Fabrication Prepare Engnieer Name' },
    { key: 'Door Details Prepare Engineer Name', label: 'Door Details Prepare Engineer' },
    { key: 'EXECUTION (PDF) PREPARED ENGINEER', label: 'EXECUTION (PDF) PREPARED ENGINEER', aliases: ['Execution (PDF)'] },
    { key: 'AS BUILT PREPARED BY ENGINEER (PRODUCTION)', label: 'AS BUILT PREPARED BY ENGINEER (PRODUCTION)', aliases: ['As Built Prepared By'] },
    { key: 'AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)', label: 'AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)', aliases: ['As Built (PDF) Prepared By'] },
    { key: 'Drawign Prepare', label: 'Drawign Prepare' },
    { key: 'DFT Prepare Engineer', label: 'DPT Prepare Engineer' },
    { key: 'Programmer Engineer Name', label: 'Programmer Engineer' },
    { key: 'Name of Fabricator', label: 'Name of Fabricator' },
    { key: 'Name of Fabrication Engineer', label: 'Name of Fabrication' },
    { key: 'Name of painter', label: 'Name of painter' },
    { key: 'Name of Assembler', label: 'Name of Assembler' },
    { key: 'Painting and Asembley Responsible Job engg. Name', label: 'Painting and Asembley' }
  ],
  production: [
    { key: 'Responsible Job Engineer', label: 'Responsible Job engg. Name' },
    { key: 'Responsible Fitter', label: 'Name of responsible Fiter' },
    { key: 'Responsible Wireman', label: 'Name of ressponsible wireman' },
    { key: 'Testing Done By Engineer', label: 'Testing done by engg.' }
  ],
  dispatch: [
    { key: 'Name of Responsible Person Checked Before Packing', label: 'Name of responsible person cheked' }
  ]
};

export default function NewJobForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(id || '');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [missingRequired, setMissingRequired] = useState(new Set());

  const primaryDept = user?.departments?.[0] || 'marketing';
  const deptName = user?.role === 'admin' ? 'Administrator' : primaryDept;
  const showAllForms = user?.username?.toLowerCase() === 'keval v shah' || user?.role === 'admin';
  const isKeval = user?.username?.toLowerCase() === 'keval v shah';
  const isMarketingOrAdmin = primaryDept === 'marketing' || user?.role === 'admin' || user?.role === 'executive' || showAllForms;

  useEffect(() => {
    if (!isMarketingOrAdmin) {
      fetchJobs();
    }
  }, [isMarketingOrAdmin]);

  useEffect(() => {
    if (id) {
      const fetchJobForEdit = async () => {
        try {
          const res = await api.get(`/jobs/${id}`);
          const job = normalizeDatesInObject(res.data);
          setCore(marketingCoreFromJob(job));
          if (showAllForms) {
            setDeptFields(Object.assign({}, ...Object.values(job.fields || {}), ...Object.values(job.allDepartmentsData || {})));
          } else if (job.fields?.[primaryDept]) {
             setDeptFields(job.fields[primaryDept]);
          } else if (job.allDepartmentsData && job.allDepartmentsData[primaryDept]) {
             setDeptFields(job.allDepartmentsData[primaryDept]);
          }
        } catch (err) {
          console.error('Failed to fetch job for editing', err);
        }
      };
      fetchJobForEdit();
    }
  }, [id, primaryDept, showAllForms]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const res = await api.get('/jobs');
      setJobs(Array.isArray(res.data) ? res.data : (res.data.jobs || []));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const [core, setCore] = useState(EMPTY_CORE);

  const [deptFields, setDeptFields] = useState({});

  const handleCoreChange = (field, value) => {
    setCore(prev => ({ ...prev, [field]: value }));
  };

  const isDepartmentUserField = (field) => {
    const key = field.toLowerCase();
    const isPersonField = /(engg|engineer|person|peson|fitter|fiter|wireman|fabricator|painter|assembler|prepared by|done by|checked by)/.test(key)
      && !key.includes('panel name')
      && !key.includes('name of panel');
    return field === 'responsibleEnggName' || isPersonField;
  };

  const handleDeptChange = (field, value) => {
    setDeptFields(prev => {
      const newFields = { ...prev, [field]: value };
      
      // Auto-fill associated date field if it's a person field
      if (value && isDepartmentUserField(field, '')) {
        const dateField = getAssociatedDateField(primaryDept, field);
        if (dateField && !newFields[dateField]) {
          newFields[dateField] = new Date().toISOString().split('T')[0];
        }
      }
      
      return newFields;
    });
  };

  const requiredDepartments = () => {
    if (showAllForms) return Object.keys(REQUIRED_DEPARTMENT_FIELDS);
    if (primaryDept === 'production' || primaryDept === 'qc') return ['production'];
    if (primaryDept === 'dispatch') return ['production', 'dispatch'];
    return REQUIRED_DEPARTMENT_FIELDS[primaryDept] ? [primaryDept] : [];
  };

  const validateRequiredFields = () => {
    const missing = [];

    if (isMarketingOrAdmin) {
      REQUIRED_CORE_FIELDS.forEach((field) => {
        if (!hasValue(core[field.key])) missing.push({ id: `core:${field.key}`, label: field.label });
      });
    } else if (!selectedJobId) {
      missing.push({ id: 'job:selectedJobId', label: 'Select Existing Job' });
    }

    requiredDepartments().forEach((department) => {
      (REQUIRED_DEPARTMENT_FIELDS[department] || []).forEach((field) => {
        const value = firstValue(deptFields[field.key], valueByAliases(deptFields, field.aliases || []));
        if (!hasValue(value)) missing.push({ id: `dept:${field.key}`, label: field.label });
      });
    });

    setMissingRequired(new Set(missing.map((field) => field.id)));
    if (missing.length > 0) {
      setError(`Please fill required fields: ${missing.map((field) => field.label).join(', ')}.`);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setError('');
    if (!validateRequiredFields()) return;
    setSaving(true);

    try {
      if (isMarketingOrAdmin) {
        const targetDepartment = primaryDept === 'admin' ? 'marketing' : primaryDept;
        const allDepartmentsData = buildDepartmentPayload(deptFields, targetDepartment, showAllForms);
        const res = await api.post('/jobs', {
          ...core,
          date: new Date().toISOString().split('T')[0],
          targetDepartment,
          allDepartmentsData
        });
        navigate(isKeval ? '/jobs/257' : `/jobs/${res.data.id}`);
      } else {
        if (!selectedJobId) {
          setError('Please select a job first');
          setSaving(false);
          return;
        }
        for (const [field, value] of Object.entries(deptFields)) {
          await api.patch(`/jobs/${selectedJobId}/field`, {
            department: primaryDept,
            field,
            value
          });
        }
        navigate(isKeval ? '/jobs/257' : `/jobs/${selectedJobId}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save job');
      setSaving(false);
    }
  };

  const inputClass = "mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2.5 border bg-white";
  const selectClass = "mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2.5 border bg-white";
  const labelClass = "block text-sm font-medium text-gray-700";
  const requiredLabelClass = (id) => `block text-sm font-medium ${submitAttempted && missingRequired.has(id) ? 'text-red-700' : 'text-gray-700'}`;
  const isRequiredDeptMissing = (field, aliases = []) => !hasValue(firstValue(deptFields[field], valueByAliases(deptFields, aliases)));
  const requiredDeptLabelClass = (field, aliases = []) => `block text-sm font-medium ${submitAttempted && isRequiredDeptMissing(field, aliases) ? 'text-red-700' : 'text-gray-700'}`;
  const requiredDeptSelectClass = (field, aliases = []) => `${selectClass} ${submitAttempted && isRequiredDeptMissing(field, aliases) ? 'border-red-400 ring-1 ring-red-200' : ''}`;
  const requiredMark = <span className="text-red-600">*</span>;


  const handleJobSelect = (e) => {
    const jobId = e.target.value;
    setSelectedJobId(jobId);
    if (!jobId) {
      setCore(EMPTY_CORE);
      setDeptFields({});
      return;
    }
    const job = jobs.find(j => j.id.toString() === jobId.toString());
    if (job) {
      setCore(marketingCoreFromJob(job));
      setDeptFields(job.departmentFields || job.fields?.[primaryDept] || {});
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 capitalize">New Job</h1>
          <p className="text-gray-500 text-sm mt-1">Fill all details to initialize a new job for your department</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Job Selection for Non-Marketing */}
        {!isMarketingOrAdmin && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Select Existing Job</h3>
              <p className="text-sm text-gray-500">Only Marketing can create new jobs. Select a job to add your department's details.</p>
            </div>
            <div className="p-6">
              <select value={selectedJobId} onChange={handleJobSelect} className={`${selectClass} ${submitAttempted && missingRequired.has('job:selectedJobId') ? 'border-red-400 ring-1 ring-red-300' : ''}`}>
                <option value="">-- Select Job No. --</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.jobNo} - {j.panelName}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Core Job Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-blue-50">
            <h3 className="text-lg font-bold text-blue-900">Core Job Details { !isMarketingOrAdmin && "(Read-Only)" }</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className={requiredLabelClass('core:jobNo')}>Job Number {requiredMark}</label>
              <input required={isMarketingOrAdmin} readOnly={!isMarketingOrAdmin} value={core.jobNo} onChange={e => handleCoreChange('jobNo', e.target.value)} className={`${inputClass} ${!isMarketingOrAdmin ? 'bg-gray-100' : ''}`} />
            </div>
            <div>
              <label className={requiredLabelClass('core:panelName')}>Panel Name {requiredMark}</label>
              {isMarketingOrAdmin ? (
                <select required value={core.panelName} onChange={e => handleCoreChange('panelName', e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {PANEL_NAME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input readOnly value={core.panelName} className={`${inputClass} bg-gray-100 outline-none`} />
              )}
            </div>
            {isMarketingOrAdmin && (
              <div>
                <label className={labelClass}>Quantity</label>
                <input type="number" value={core.qty} onChange={e => handleCoreChange('qty', e.target.value)} className={inputClass} />
              </div>
            )}
            <div>
              <label className={requiredLabelClass('core:typeOfIndustries')}>Industry Type {requiredMark}</label>
              {isMarketingOrAdmin ? (
                <select required value={core.typeOfIndustries} onChange={e => handleCoreChange('typeOfIndustries', e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {INDUSTRY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input readOnly value={core.typeOfIndustries} className={`${inputClass} bg-gray-100 outline-none`} />
              )}
            </div>
            <div>
              <label className={requiredLabelClass('core:projectName')}>Project Name {requiredMark}</label>
              <input required={isMarketingOrAdmin} readOnly={!isMarketingOrAdmin} value={core.projectName} onChange={e => handleCoreChange('projectName', e.target.value)} className={`${inputClass} ${!isMarketingOrAdmin ? 'bg-gray-100' : ''}`} />
            </div>
            {isMarketingOrAdmin && (
              <>
                <div>
                  <label className={labelClass}>Customer Name</label>
                  <select value={core.clientName} onChange={e => handleCoreChange('clientName', e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    {CUSTOMER_NAME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Panel Type</label>
                  <select value={core.typeOfPanel} onChange={e => handleCoreChange('typeOfPanel', e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    {PANEL_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className={requiredLabelClass('core:responsibleEnggName')}>Responsible Engineer {requiredMark}</label>
              {isMarketingOrAdmin ? (
                <select required value={core.responsibleEnggName} onChange={e => handleCoreChange('responsibleEnggName', e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {DEPARTMENT_USER_OPTIONS.marketing.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input readOnly value={core.responsibleEnggName} className={`${inputClass} bg-gray-100 outline-none`} />
              )}
            </div>
            {isMarketingOrAdmin && (
              <div>
                <label className={labelClass}>Purchase Order Number</label>
                <input value={core.poNo} onChange={e => handleCoreChange('poNo', e.target.value)} className={inputClass} />
              </div>
            )}
            <div>
              <label className={labelClass}>Purchase Order Date</label>
              {isMarketingOrAdmin ? (
                <input type="date" value={core.poDate} onChange={e => handleCoreChange('poDate', e.target.value)} className={inputClass} />
              ) : (
                <input type="text" readOnly value={core.poDate} className={`${inputClass} bg-gray-100 outline-none`} />
              )}
            </div>
            {isMarketingOrAdmin && (
              <>
                <div>
                  <label className={labelClass}>Delivery Period</label>
                  <input value={core.deliveryPeriod} onChange={e => handleCoreChange('deliveryPeriod', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Delivery Date</label>
                  <input type="date" value={core.deliveryDate} onChange={e => handleCoreChange('deliveryDate', e.target.value)} className={inputClass} />
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>Data Given to Design</label>
              {isMarketingOrAdmin ? (
                <input type="date" value={core.dataGivenToDesign} onChange={e => handleCoreChange('dataGivenToDesign', e.target.value)} className={inputClass} />
              ) : (
                <input type="text" readOnly value={core.dataGivenToDesign} className={`${inputClass} bg-gray-100 outline-none`} />
              )}
            </div>
            {isMarketingOrAdmin && (
              <>
                <div className="md:col-span-2">
                  <label className={labelClass}>Delivery Address</label>
                  <input value={core.deliveryAddress} onChange={e => handleCoreChange('deliveryAddress', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contact Person</label>
                  <input value={core.contactPerson} onChange={e => handleCoreChange('contactPerson', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contact Number</label>
                  <input value={deptFields['Contact Number'] || ''} onChange={e => handleDeptChange('Contact Number', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Transportation Details</label>
                  <select value={deptFields['Transportation'] || ''} onChange={e => handleDeptChange('Transportation', e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    {TRANSPORT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Packing Requirements</label>
                  <select value={deptFields['Packing'] || ''} onChange={e => handleDeptChange('Packing', e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    {PACKING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Inspection Call Date</label>
                  <input type="date" value={deptFields['Inspection Call date'] || ''} onChange={e => handleDeptChange('Inspection Call date', e.target.value)} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Marketing Remarks</label>
                  <input value={deptFields['Marketing Remarks'] || ''} onChange={e => handleDeptChange('Marketing Remarks', e.target.value)} className={inputClass} />
                </div>
              </>
            )}
          </div>
        </div>

        {(primaryDept === 'design' || showAllForms) && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
                <h3 className="text-lg font-bold text-green-900">Design - Electrical</h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className={labelClass}>Planned Date</label>
                <input type="date" value={deptFields['Design Planned Date'] || ''} onChange={e => handleDeptChange('Design Planned Date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Drawing Submission Date</label>
                <input type="date" value={deptFields['Drawing Submission Date'] || ''} onChange={e => handleDeptChange('Drawing Submission Date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={requiredDeptLabelClass('Drawing Submission Engineer Name')}>Drawing Submission Engineer Name {requiredMark}</label>
                <select value={deptFields['Drawing Submission Engineer Name'] || ''} onChange={e => handleDeptChange('Drawing Submission Engineer Name', e.target.value)} className={requiredDeptSelectClass('Drawing Submission Engineer Name')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.design.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Final Approved Drawings Received Date</label>
                <input type="date" value={deptFields['Final Approved Drawings Received Date'] || ''} onChange={e => handleDeptChange('Final Approved Drawings Received Date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>BOM Released To Purchase</label>
                <input type="date" value={deptFields['BOM Released To Purchase'] || deptFields['BOM Released To ERP System'] || ''} onChange={e => handleDeptChange('BOM Released To Purchase', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>SO No. of ERP System</label>
                <input type="text" value={deptFields['SO No. of ERP System'] || ''} onChange={e => handleDeptChange('SO No. of ERP System', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={requiredDeptLabelClass('BOM Prepare Engnieer Name')}>BOM Prepare Engnieer Name {requiredMark}</label>
                <select value={deptFields['BOM Prepare Engnieer Name'] || ''} onChange={e => handleDeptChange('BOM Prepare Engnieer Name', e.target.value)} className={requiredDeptSelectClass('BOM Prepare Engnieer Name')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.design.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>
          </div>

          {[0, 1, 2].map(rev => (
            <div key={rev} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-green-100">
                <h3 className="text-lg font-bold text-green-900">Drawing Sumition Date and Engnieer Name (Rev R{rev})</h3>
              </div>
              <div className="p-6 space-y-4">
                {['GA', 'SLD', 'BOQ', 'CONTROL'].map(doc => {
                  const startKey = `Rev R${rev} ${doc} START DATE`;
                  const endKey = `Rev R${rev} ${doc} END DATE`;
                  const personKey = `Rev R${rev} ${doc} Name of Peson`;
                  const oldStartKey = `Rev R${rev} ${doc} Start Date`;
                  const oldEndKey = `Rev R${rev} ${doc} End Date`;
                  const oldPersonKey = `Rev R${rev} ${doc} Name of Person`;
                  return (
                    <div key={doc} className="grid grid-cols-1 md:grid-cols-[120px_repeat(3,minmax(0,1fr))] gap-4 p-4 border border-gray-200 rounded-lg bg-gray-50 items-end">
                      <div className="font-bold text-sm text-green-900 md:pb-3">{doc}</div>
                      <div>
                        <label className={labelClass}>{startKey}</label>
                        <input type="date" value={deptFields[startKey] || deptFields[oldStartKey] || ''} onChange={e => handleDeptChange(startKey, e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>{endKey}</label>
                        <input type="date" value={deptFields[endKey] || deptFields[oldEndKey] || ''} onChange={e => handleDeptChange(endKey, e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className={requiredDeptLabelClass(personKey, [oldPersonKey])}>Name of Peson {requiredMark}</label>
                        <select value={deptFields[personKey] || deptFields[oldPersonKey] || ''} onChange={e => handleDeptChange(personKey, e.target.value)} className={requiredDeptSelectClass(personKey, [oldPersonKey])}>
                          <option value="">-- Select --</option>
                          {DEPARTMENT_USER_OPTIONS.design.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border border-green-100 rounded-lg bg-green-50">
                  <div>
                    <label className={labelClass}>Rev R{rev} PDF</label>
                    <input type="date" value={deptFields[`Rev R${rev} PDF`] || ''} onChange={e => handleDeptChange(`Rev R${rev} PDF`, e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={requiredDeptLabelClass(`Rev R${rev} PDF Name of Peson`, [`Rev R${rev} PDF Name`, `Rev R${rev} PDF Name of Person`])}>Name of Peson {requiredMark}</label>
                    <select value={deptFields[`Rev R${rev} PDF Name of Peson`] || deptFields[`Rev R${rev} PDF Name of Person`] || deptFields[`Rev R${rev} PDF Name`] || ''} onChange={e => handleDeptChange(`Rev R${rev} PDF Name of Peson`, e.target.value)} className={requiredDeptSelectClass(`Rev R${rev} PDF Name of Peson`, [`Rev R${rev} PDF Name`, `Rev R${rev} PDF Name of Person`])}>
                      <option value="">-- Select --</option>
                      {DEPARTMENT_USER_OPTIONS.design.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>CLIENT SUBMISSION DATE R{rev}</label>
                    <input type="date" value={deptFields[`Client Submission Date R${rev}`] || ''} onChange={e => handleDeptChange(`Client Submission Date R${rev}`, e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}

        {(primaryDept === 'purchase' || showAllForms) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-purple-50">
              <h3 className="text-lg font-bold text-purple-900">Procurement Details</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Switchgear PO Number</label>
                <input type="text" value={deptFields['Switchgear PO Number'] || ''} onChange={e => handleDeptChange('Switchgear PO Number', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Switchgear Date</label>
                <input type="date" value={deptFields['Switchgear Date'] || ''} onChange={e => handleDeptChange('Switchgear Date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Misc PO Number</label>
                <input type="text" value={deptFields['Misc PO Number'] || ''} onChange={e => handleDeptChange('Misc PO Number', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Misc Date</label>
                <input type="date" value={deptFields['Misc Date'] || ''} onChange={e => handleDeptChange('Misc Date', e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
        )}

        {(primaryDept === 'mechanical' || showAllForms) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-orange-50">
              <h3 className="text-lg font-bold text-orange-900">Design - Mechanical</h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              <div className="col-span-full border-b border-orange-100 pb-2 mb-2">
                <h4 className="text-sm font-bold text-orange-900 uppercase tracking-wide">Drawing & Programming</h4>
              </div>
              
              <div><label className={labelClass}>Drawing start Date</label><input type="date" value={deptFields['Drawing start Date'] || ''} onChange={e => handleDeptChange('Drawing start Date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Drawing Complete Date</label><input type="date" value={deptFields['Drawing Complete Date'] || ''} onChange={e => handleDeptChange('Drawing Complete Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Drawign Prepare')}>Drawing Prepare {requiredMark}</label>
                <select value={deptFields['Drawign Prepare'] || ''} onChange={e => handleDeptChange('Drawign Prepare', e.target.value)} className={requiredDeptSelectClass('Drawign Prepare')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              
              <div><label className={labelClass}>Door and Service Plate</label><input type="date" value={deptFields['Door and Service Plate'] || ''} onChange={e => handleDeptChange('Door and Service Plate', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Drafting File Handover Date</label><input type="date" value={deptFields['Drafting File Handover Date'] || ''} onChange={e => handleDeptChange('Drafting File Handover Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('DFT Prepare Engineer')}>DFT Prepare Engineer {requiredMark}</label>
                <select value={deptFields['DFT Prepare Engineer'] || ''} onChange={e => handleDeptChange('DFT Prepare Engineer', e.target.value)} className={requiredDeptSelectClass('DFT Prepare Engineer')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              
              <div><label className={labelClass}>Release to programme</label><input type="date" value={deptFields['Release to programme'] || ''} onChange={e => handleDeptChange('Release to programme', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Programme Start date</label><input type="date" value={deptFields['Programme Start date'] || ''} onChange={e => handleDeptChange('Programme Start date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Programme End date</label><input type="date" value={deptFields['Programme End date'] || ''} onChange={e => handleDeptChange('Programme End date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Programmer Engineer Name')}>Programmer Engineer {requiredMark}</label>
                <select value={deptFields['Programmer Engineer Name'] || ''} onChange={e => handleDeptChange('Programmer Engineer Name', e.target.value)} className={requiredDeptSelectClass('Programmer Engineer Name')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              
              <div><label className={labelClass}>Programming release to</label><input type="text" value={deptFields['Programming release to'] || ''} onChange={e => handleDeptChange('Programming release to', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Puching & Laser Start</label><input type="date" value={deptFields['Puching & Laser Start'] || ''} onChange={e => handleDeptChange('Puching & Laser Start', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Puchnig & Laser End</label><input type="date" value={deptFields['Puching & Laser End'] || ''} onChange={e => handleDeptChange('Puching & Laser End', e.target.value)} className={inputClass} /></div>

              <div className="col-span-full border-t border-orange-100 pt-4 mt-2">
                <h4 className="text-sm font-bold text-orange-900 uppercase tracking-wide">Fabrication Details</h4>
              </div>
              
              <div>
                <label className={labelClass}>Fabrication Release Date</label>
                <input type="date" value={deptFields['Fabrication Release Date'] || ''} onChange={e => handleDeptChange('Fabrication Release Date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Swati / Oursource Fabricator Name</label>
                <select value={deptFields['Swati / Oursource Fabricator Name'] || deptFields['Swati / Outsource'] || ''} onChange={e => handleDeptChange('Swati / Oursource Fabricator Name', e.target.value)} className={selectClass}>
                  <option value="">-- Select --</option>
                  <option value="Swati">Swati</option>
                  <option value="Outsource">Outsource</option>
                </select>
              </div>
              <div>
                <label className={requiredDeptLabelClass('Fabrication Prepare Engnieer Name')}>Fabrication Prepare Engnieer Name {requiredMark}</label>
                <select value={deptFields['Fabrication Prepare Engnieer Name'] || ''} onChange={e => handleDeptChange('Fabrication Prepare Engnieer Name', e.target.value)} className={requiredDeptSelectClass('Fabrication Prepare Engnieer Name')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Door Details Sent Date</label>
                <input type="date" value={deptFields['Door Details Sent Date'] || ''} onChange={e => handleDeptChange('Door Details Sent Date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={requiredDeptLabelClass('Door Details Prepare Engineer Name')}>Door Details Prepare Engineer {requiredMark}</label>
                <select value={deptFields['Door Details Prepare Engineer Name'] || ''} onChange={e => handleDeptChange('Door Details Prepare Engineer Name', e.target.value)} className={requiredDeptSelectClass('Door Details Prepare Engineer Name')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>EXECUTION FILE DATE</label>
                <input type="date" value={deptFields['EXECUTION FILE DATE'] || deptFields['Execution File Date'] || ''} onChange={e => handleDeptChange('EXECUTION FILE DATE', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={requiredDeptLabelClass('EXECUTION (PDF) PREPARED ENGINEER', ['Execution (PDF)'])}>EXECUTION (PDF) PREPARED ENGINEER {requiredMark}</label>
                <select value={deptFields['EXECUTION (PDF) PREPARED ENGINEER'] || deptFields['Execution (PDF)'] || ''} onChange={e => handleDeptChange('EXECUTION (PDF) PREPARED ENGINEER', e.target.value)} className={requiredDeptSelectClass('EXECUTION (PDF) PREPARED ENGINEER', ['Execution (PDF)'])}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>AS BUILT SUBMISSION DATE</label>
                <input type="date" value={deptFields['AS BUILT SUBMISSION DATE'] || deptFields['As Built Submission'] || ''} onChange={e => handleDeptChange('AS BUILT SUBMISSION DATE', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={requiredDeptLabelClass('AS BUILT PREPARED BY ENGINEER (PRODUCTION)', ['As Built Prepared By'])}>AS BUILT PREPARED BY ENGINEER (PRODUCTION) {requiredMark}</label>
                <select value={deptFields['AS BUILT PREPARED BY ENGINEER (PRODUCTION)'] || deptFields['As Built Prepared By'] || ''} onChange={e => handleDeptChange('AS BUILT PREPARED BY ENGINEER (PRODUCTION)', e.target.value)} className={requiredDeptSelectClass('AS BUILT PREPARED BY ENGINEER (PRODUCTION)', ['As Built Prepared By'])}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.production.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className={requiredDeptLabelClass('AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)', ['As Built (PDF) Prepared By'])}>AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN) {requiredMark}</label>
                <select value={deptFields['AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)'] || deptFields['As Built (PDF) Prepared By'] || ''} onChange={e => handleDeptChange('AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)', e.target.value)} className={requiredDeptSelectClass('AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)', ['As Built (PDF) Prepared By'])}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              
              <div className="col-span-full border-t border-orange-100 pt-4 mt-2">
                <h4 className="text-sm font-bold text-orange-900 uppercase tracking-wide">Fabrication Production</h4>
              </div>
              <div><label className={labelClass}>Drawing start Date</label><input type="date" value={deptFields['Drawing start Date'] || ''} onChange={e => handleDeptChange('Drawing start Date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Drawing Complete</label><input type="date" value={deptFields['Drawing Complete Date'] || ''} onChange={e => handleDeptChange('Drawing Complete Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Drawign Prepare')}>Drawign Prepare {requiredMark}</label>
                <select value={deptFields['Drawign Prepare'] || ''} onChange={e => handleDeptChange('Drawign Prepare', e.target.value)} className={requiredDeptSelectClass('Drawign Prepare')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              
              <div><label className={labelClass}>Door and Panel Service Plate</label><input type="date" value={deptFields['Door and Service Plate'] || ''} onChange={e => handleDeptChange('Door and Service Plate', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Drafing File Handover</label><input type="date" value={deptFields['Drafting File Handover Date'] || ''} onChange={e => handleDeptChange('Drafting File Handover Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('DFT Prepare Engineer')}>DPT Prepare Engineer {requiredMark}</label>
                <select value={deptFields['DFT Prepare Engineer'] || ''} onChange={e => handleDeptChange('DFT Prepare Engineer', e.target.value)} className={requiredDeptSelectClass('DFT Prepare Engineer')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              
              <div><label className={labelClass}>Release to programme</label><input type="date" value={deptFields['Release to programme'] || ''} onChange={e => handleDeptChange('Release to programme', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Programme Start date</label><input type="date" value={deptFields['Programme Start date'] || ''} onChange={e => handleDeptChange('Programme Start date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Programme End date</label><input type="date" value={deptFields['Programme End date'] || ''} onChange={e => handleDeptChange('Programme End date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Programmer Engineer Name')}>Programmer Engineer {requiredMark}</label>
                <select value={deptFields['Programmer Engineer Name'] || ''} onChange={e => handleDeptChange('Programmer Engineer Name', e.target.value)} className={requiredDeptSelectClass('Programmer Engineer Name')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              
              <div><label className={labelClass}>Programming release to</label><input type="text" value={deptFields['Programming release to'] || ''} onChange={e => handleDeptChange('Programming release to', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Puching & Laser Start</label><input type="date" value={deptFields['Puching & Laser Start'] || ''} onChange={e => handleDeptChange('Puching & Laser Start', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Puchnig & Laser</label><input type="date" value={deptFields['Puching & Laser End'] || ''} onChange={e => handleDeptChange('Puching & Laser End', e.target.value)} className={inputClass} /></div>

              <div className="col-span-full border-t border-orange-100 pt-4 mt-2">
                <h4 className="text-sm font-bold text-orange-900 uppercase tracking-wide">Fabrication</h4>
              </div>

              <div><label className={labelClass}>Bending start date</label><input type="date" value={deptFields['Bending start date'] || ''} onChange={e => handleDeptChange('Bending start date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Bending complete</label><input type="date" value={deptFields['Bending complete'] || ''} onChange={e => handleDeptChange('Bending complete', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Welding start date</label><input type="date" value={deptFields['Welding start date'] || ''} onChange={e => handleDeptChange('Welding start date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Welding complete</label><input type="date" value={deptFields['Welding complete'] || ''} onChange={e => handleDeptChange('Welding complete', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Name of Fabricator')}>Name of Fabricator {requiredMark}</label>
                <select value={deptFields['Name of Fabricator'] || ''} onChange={e => handleDeptChange('Name of Fabricator', e.target.value)} className={requiredDeptSelectClass('Name of Fabricator')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className={requiredDeptLabelClass('Name of Fabrication Engineer')}>Name of Fabrication {requiredMark}</label>
                <select value={deptFields['Name of Fabrication Engineer'] || ''} onChange={e => handleDeptChange('Name of Fabrication Engineer', e.target.value)} className={requiredDeptSelectClass('Name of Fabrication Engineer')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Release to Painting</label><input type="date" value={deptFields['Release to Painting'] || ''} onChange={e => handleDeptChange('Release to Painting', e.target.value)} className={inputClass} /></div>

              <div className="col-span-full border-t border-orange-100 pt-4 mt-2">
                <h4 className="text-sm font-bold text-orange-900 uppercase tracking-wide">Painting & Assembly</h4>
              </div>

              <div><label className={labelClass}>Recived to painting</label><input type="date" value={deptFields['Recived to painting'] || ''} onChange={e => handleDeptChange('Recived to painting', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Name of painter')}>Name of painter {requiredMark}</label>
                <select value={deptFields['Name of painter'] || ''} onChange={e => handleDeptChange('Name of painter', e.target.value)} className={requiredDeptSelectClass('Name of painter')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Panel Assembly</label><input type="date" value={deptFields['Panel Assembly Start'] || ''} onChange={e => handleDeptChange('Panel Assembly Start', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Panel Assembly</label><input type="date" value={deptFields['Panel Assembly Complete'] || ''} onChange={e => handleDeptChange('Panel Assembly Complete', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Name of Assembler')}>Name of Assembler {requiredMark}</label>
                <select value={deptFields['Name of Assembler'] || ''} onChange={e => handleDeptChange('Name of Assembler', e.target.value)} className={requiredDeptSelectClass('Name of Assembler')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className={requiredDeptLabelClass('Painting and Asembley Responsible Job engg. Name')}>Painting and Asembley {requiredMark}</label>
                <select value={deptFields['Painting and Asembley Responsible Job engg. Name'] || ''} onChange={e => handleDeptChange('Painting and Asembley Responsible Job engg. Name', e.target.value)} className={requiredDeptSelectClass('Painting and Asembley Responsible Job engg. Name')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {(primaryDept === 'production' || primaryDept === 'dispatch' || primaryDept === 'qc' || showAllForms) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden space-y-6">
            <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
              <h3 className="text-lg font-bold text-green-900">Production, QC & Dispatch Details</h3>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className={requiredDeptLabelClass('Responsible Job Engineer')}>Responsible Job engg. Name {requiredMark}</label>
                <select value={deptFields['Responsible Job Engineer'] || ''} onChange={e => handleDeptChange('Responsible Job Engineer', e.target.value)} className={requiredDeptSelectClass('Responsible Job Engineer')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.production.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Busbar work start date</label><input type="date" value={deptFields['Busbar Work Start Date'] || ''} onChange={e => handleDeptChange('Busbar Work Start Date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Busbar work complete</label><input type="date" value={deptFields['Busbar Work Complete Date'] || ''} onChange={e => handleDeptChange('Busbar Work Complete Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Responsible Fitter')}>Name of responsible Fiter {requiredMark}</label>
                <select value={deptFields['Responsible Fitter'] || ''} onChange={e => handleDeptChange('Responsible Fitter', e.target.value)} className={requiredDeptSelectClass('Responsible Fitter')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.production.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Wiring start Date</label><input type="date" value={deptFields['Wiring Start Date'] || ''} onChange={e => handleDeptChange('Wiring Start Date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Wiring Complete Date</label><input type="date" value={deptFields['Wiring Complete Date'] || ''} onChange={e => handleDeptChange('Wiring Complete Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Responsible Wireman')}>Name of ressponsible wireman {requiredMark}</label>
                <select value={deptFields['Responsible Wireman'] || ''} onChange={e => handleDeptChange('Responsible Wireman', e.target.value)} className={requiredDeptSelectClass('Responsible Wireman')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.production.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Testing start date</label><input type="date" value={deptFields['Testing Start Date'] || ''} onChange={e => handleDeptChange('Testing Start Date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Testing completedate</label><input type="date" value={deptFields['Testing Complete Date'] || ''} onChange={e => handleDeptChange('Testing Complete Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Testing Done By Engineer')}>Testing done by engg. {requiredMark}</label>
                <select value={deptFields['Testing Done By Engineer'] || ''} onChange={e => handleDeptChange('Testing Done By Engineer', e.target.value)} className={requiredDeptSelectClass('Testing Done By Engineer')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.qcDispatch.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Actual Inspection date</label><input type="date" value={deptFields['Actual Inspection Date'] || ''} onChange={e => handleDeptChange('Actual Inspection Date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Compliance/ Dispatch clearence Date</label><input type="date" value={deptFields['Compliance / Dispatch Clearance Date'] || ''} onChange={e => handleDeptChange('Compliance / Dispatch Clearance Date', e.target.value)} className={inputClass} /></div>
              
              <div className="col-span-full border-t border-gray-100 pt-4 mt-2">
                <h4 className="font-bold text-gray-700 mb-4">Dispatch Planning</h4>
              </div>
              <div><label className={labelClass}>Packing start date</label><input type="date" value={deptFields['Packing Start Date'] || ''} onChange={e => handleDeptChange('Packing Start Date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Packing complete date</label><input type="date" value={deptFields['Packing Complete Date'] || ''} onChange={e => handleDeptChange('Packing Complete Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Name of Responsible Person Checked Before Packing')}>Name of responsible person cheked {requiredMark}</label>
                <select value={deptFields['Name of Responsible Person Checked Before Packing'] || ''} onChange={e => handleDeptChange('Name of Responsible Person Checked Before Packing', e.target.value)} className={requiredDeptSelectClass('Name of Responsible Person Checked Before Packing')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.qcDispatch.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Dispatch date</label><input type="date" value={deptFields['Dispatch Date'] || ''} onChange={e => handleDeptChange('Dispatch Date', e.target.value)} className={inputClass} /></div>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end space-x-3">
          <button type="button" onClick={() => navigate('/')} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex items-center space-x-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            <span>{saving ? 'Saving...' : 'Save New Job'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

