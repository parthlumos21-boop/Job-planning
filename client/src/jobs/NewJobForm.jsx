import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { ArrowLeft, Save, Loader2, Plus, Minus, CheckSquare, X } from 'lucide-react';
import { DEPARTMENT_USER_OPTIONS } from './departmentUserOptions';
import SearchableUserSelect from './SearchableUserSelect';
import SearchableJobSelect from './SearchableJobSelect';
import {
  CUSTOMER_NAME_OPTIONS,
  INDUSTRY_OPTIONS,
  PANEL_NAME_OPTIONS,
  PANEL_TYPE_OPTIONS
} from './jobDropdownOptions';
import { getAssociatedDateField } from './jobProgress';
import SimpleHandoverModal from './SimpleHandoverModal';
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
    'Door and Service Plate', 'Door and Service Plate Prepare Engineer Name',
    'Drafting File Handover Date',
    'DFT Prepare Engineer', 'Release to programme', 'Programme Start date',
    'Programme End date', 'Programmer Engineer Name',
    'Programming release to punching & Laser date', 'Programming release to',
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
  assignedEngineerId: '',
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
    assignedEngineerId: job?.assignedEngineerId || '',
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
    { key: 'Door and Service Plate Prepare Engineer Name', label: 'Door & Service Plate Prepare Engineer' },
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
  const submittingRef = useRef(false);
  
  const [jobs, setJobs] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(id || '');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [missingRequired, setMissingRequired] = useState(new Set());

  const primaryDept = user?.departments?.[0] || 'marketing';
  const userDepts = (user?.departments || []).map(d => String(d).toLowerCase().trim());
  const userRole = (user?.role || '').toLowerCase().trim();
  const userName = (user?.username || '').toLowerCase().trim();
  const isKeval = userName === 'keval v shah' || userName === 'keval' || userName === 'kevalvshah';
  const isAdmin = userRole === 'admin' || userRole === 'executive' || userRole === 'superadmin' || isKeval;
  const isMarketing = userDepts.includes('marketing') || userRole === 'marketing_lead' || userRole === 'mktadmin';
  const isMarketingOrAdmin = isAdmin || isMarketing;
  const canEditCore = isMarketingOrAdmin;
  const showAllForms = isAdmin;
  const deptName = isAdmin ? 'Administrator' : primaryDept;

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (id) {
      const fetchJobForEdit = async () => {
        try {
          const res = await api.get(`/jobs/${id}`);
          const job = normalizeDatesInObject(res.data);
          setCurrentJob(job);
          setCore(marketingCoreFromJob(job));
          let loadedFields = {};
          if (showAllForms) {
            loadedFields = Object.assign({}, ...Object.values(job.fields || {}), ...Object.values(job.allDepartmentsData || {}));
          } else if (job.fields?.[primaryDept]) {
             loadedFields = job.fields[primaryDept];
          } else if (job.allDepartmentsData && job.allDepartmentsData[primaryDept]) {
             loadedFields = job.allDepartmentsData[primaryDept];
          }
          setDeptFields(loadedFields);

          // Auto-detect existing revisions from loaded fields per document type
          const docs = ['GA', 'SLD', 'BOQ', 'CONTROL'];
          const detectedDocs = { GA: [0], SLD: [0], BOQ: [0], CONTROL: [0], PDF: [0] };
          docs.forEach(doc => {
            const revSet = new Set([0]);
            Object.keys(loadedFields).forEach(k => {
              const m = k.match(new RegExp(`^Rev R(\\d+) ${doc}`, 'i'));
              if (m) revSet.add(parseInt(m[1], 10));
            });
            detectedDocs[doc] = Array.from(revSet).sort((a, b) => a - b);
          });
          const pdfSet = new Set([0]);
          Object.keys(loadedFields).forEach(k => {
            const m = k.match(/^Rev R(\d+) PDF/i) || k.match(/Client Submission Date R(\d+)/i) || k.match(/CLIENT SUBMISSION DATE R(\d+)/i);
            if (m) pdfSet.add(parseInt(m[1], 10));
          });
          detectedDocs.PDF = Array.from(pdfSet).sort((a, b) => a - b);
          if (job.fields?.myTask) {
            setMyTask({
              estimatedEffortHours: job.fields.myTask.estimatedEffortHours || '',
              taskStartDate: job.fields.myTask.taskStartDate || new Date().toISOString().split('T')[0],
              taskTargetCompletionDate: job.fields.myTask.taskTargetCompletionDate || ''
            });
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
      const res = await api.get('/jobs/lookup');
      setJobs(Array.isArray(res.data) ? res.data : (res.data?.jobs || []));
    } catch (err) {
      console.error('Failed to load lookup jobs from database:', err);
    } finally {
      setLoading(false);
    }
  };

  const [core, setCore] = useState(EMPTY_CORE);
  const [deptFields, setDeptFields] = useState({});
  const [docRevisions, setDocRevisions] = useState({
    GA: [0],
    SLD: [0],
    BOQ: [0],
    CONTROL: [0],
    PDF: [0]
  });

  // My Task Planning State (Regular Department Users)
  const [myTask, setMyTask] = useState({
    estimatedEffortHours: '',
    taskStartDate: new Date().toISOString().split('T')[0],
    taskTargetCompletionDate: ''
  });
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalDraft, setTaskModalDraft] = useState({
    estimatedEffortHours: '',
    taskStartDate: new Date().toISOString().split('T')[0],
    taskTargetCompletionDate: ''
  });
  const [taskModalError, setTaskModalError] = useState('');

  const handleAddDocRevision = (docType) => {
    setDocRevisions(prev => {
      const currentList = prev[docType] || [0];
      const nextRev = Math.max(...currentList, 0) + 1;
      return {
        ...prev,
        [docType]: [...currentList, nextRev]
      };
    });
  };

  const handleRemoveDocRevision = (docType, revToRemove) => {
    if (revToRemove === 0) return;
    setDocRevisions(prev => ({
      ...prev,
      [docType]: (prev[docType] || [0]).filter(r => r !== revToRemove)
    }));
    setDeptFields(prev => {
      const updated = { ...prev };
      if (docType === 'PDF') {
        delete updated[`Rev R${revToRemove} PDF`];
        delete updated[`Rev R${revToRemove} PDF Name of Peson`];
        delete updated[`Rev R${revToRemove} PDF Name of Person`];
        delete updated[`Rev R${revToRemove} PDF Name`];
        delete updated[`Client Submission Date R${revToRemove}`];
        delete updated[`CLIENT SUBMISSION DATE R${revToRemove}`];
      } else {
        delete updated[`Rev R${revToRemove} ${docType} START DATE`];
        delete updated[`Rev R${revToRemove} ${docType} Start Date`];
        delete updated[`Rev R${revToRemove} ${docType} END DATE`];
        delete updated[`Rev R${revToRemove} ${docType} End Date`];
        delete updated[`Rev R${revToRemove} ${docType} Name of Peson`];
        delete updated[`Rev R${revToRemove} ${docType} Name of Person`];
      }
      return updated;
    });
  };

  const handleCoreChange = (field, value) => {
    let cleanVal = value;
    if (field === 'jobNo' && typeof cleanVal === 'string') {
      cleanVal = cleanVal.replace(/#/g, '');
    }
    setCore(prev => ({ ...prev, [field]: cleanVal }));
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
      let fieldsToValidate = REQUIRED_DEPARTMENT_FIELDS[department] || [];
      if (department === 'design') {
        fieldsToValidate = [
          { key: 'BOM Prepare Engnieer Name', label: 'BOM Prepare Engnieer Name' },
          { key: 'Drawing Submission Engineer Name', label: 'Drawing Submission Engineer Name' },
          ...['GA', 'SLD', 'BOQ', 'CONTROL'].flatMap((doc) =>
            (docRevisions[doc] || [0]).map((rev) => ({
              key: `Rev R${rev} ${doc} Name of Peson`,
              label: `Rev R${rev} ${doc} Name of Peson`
            }))
          ),
          ...(docRevisions.PDF || [0]).map((rev) => ({
            key: `Rev R${rev} PDF Name of Peson`,
            label: `Rev R${rev} PDF Name of Peson`,
            aliases: [`Rev R${rev} PDF Name`, `Rev R${rev} PDF Name of Person`]
          }))
        ];
      }
      fieldsToValidate.forEach((field) => {
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

  const handleSubmit = async (e, shouldSubmitHandover = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (submittingRef.current || saving) return;
    setSubmitAttempted(true);
    setError('');
    if (!validateRequiredFields()) return;
    setSaving(true);
    submittingRef.current = true;

    try {
      let savedJobId;
      if (id) {
        // True Edit Mode (/jobs/edit/:id)
        savedJobId = id;
        for (const [field, value] of Object.entries(deptFields)) {
          await api.patch(`/jobs/${id}/field`, {
            department: primaryDept,
            field,
            value
          });
        }
        if (myTask.estimatedEffortHours) {
          await api.patch(`/jobs/${id}/workflow/my-task`, {
            estimatedEffort: Number(myTask.estimatedEffortHours),
            targetedDate: myTask.taskTargetCompletionDate
          });
        }
      } else {
        // New Job Mode (/jobs/new): Always creates a brand-new record in PostgreSQL!
        const targetDepartment = primaryDept === 'admin' ? 'marketing' : primaryDept;
        const allDepartmentsData = buildDepartmentPayload(deptFields, targetDepartment, true);
        const cleanCore = { ...core };
        if (cleanCore.jobNo) {
          cleanCore.jobNo = cleanCore.jobNo.replace(/#/g, '').trim();
        }
        const res = await api.post('/jobs', {
          ...cleanCore,
          date: new Date().toISOString().split('T')[0],
          targetDepartment,
          allDepartmentsData,
          myTask: myTask.estimatedEffortHours ? myTask : undefined
        });
        savedJobId = res.data?.id || res.data?.external_id;
      }

      if (shouldSubmitHandover && savedJobId) {
        await api.post(`/jobs/${savedJobId}/handover/submit`, {
          targetDepartment: 'planning',
          fromDepartment: primaryDept,
          checklist: {
            coreVerified: true,
            poVerified: true,
            engineerAssigned: Boolean(core.responsibleEnggName)
          },
          notes: 'Submitted for Planning from Job Form'
        });
        navigate('/jobs/handover');
      } else if (savedJobId) {
        navigate(`/jobs/${savedJobId}`);
      } else {
        navigate('/my-jobs');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to save job');
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const inputClass = "mt-1 block w-full h-[38px] rounded-[7px] border-slate-300 text-slate-800 text-[13px] px-3 shadow-2xs border bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors";
  const selectClass = "mt-1 block w-full h-[38px] rounded-[7px] border-slate-300 text-slate-800 text-[13px] px-3 shadow-2xs border bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors";
  const textareaClass = "mt-1 block w-full h-[64px] rounded-[7px] border-slate-300 text-slate-800 text-[13px] p-2.5 shadow-2xs border bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none";
  const labelClass = "block text-[12px] font-semibold text-slate-700 tracking-tight";
  const requiredLabelClass = (id) => `block text-[12px] font-semibold tracking-tight ${submitAttempted && missingRequired.has(id) ? 'text-red-700' : 'text-slate-700'}`;
  const isRequiredDeptMissing = (field, aliases = []) => !hasValue(firstValue(deptFields[field], valueByAliases(deptFields, aliases)));
  const requiredDeptLabelClass = (field, aliases = []) => `block text-[12px] font-semibold tracking-tight ${submitAttempted && isRequiredDeptMissing(field, aliases) ? 'text-red-700' : 'text-slate-700'}`;
  const requiredDeptSelectClass = (field, aliases = []) => `${selectClass} ${submitAttempted && isRequiredDeptMissing(field, aliases) ? 'border-red-400 ring-1 ring-red-200' : ''}`;
  const requiredMark = <span className="text-red-600">*</span>;


  const handleJobSelect = async (jobOrId) => {
    const jobId = jobOrId?.id || jobOrId;
    setSelectedJobId(jobId);
    if (!jobId) {
      setCore(EMPTY_CORE);
      setDeptFields({});
      setCurrentJob(null);
      return;
    }

    try {
      setLoading(true);
      const res = await api.get(`/jobs/${jobId}`);
      const job = normalizeDatesInObject(res.data);
      setCurrentJob(job);
      const coreData = marketingCoreFromJob(job);
      if (coreData.jobNo) {
        coreData.jobNo = coreData.jobNo.replace(/#/g, '').trim();
      }
      setCore(coreData);

      let loadedFields = {};
      if (showAllForms) {
        loadedFields = Object.assign({}, ...Object.values(job.fields || {}), ...Object.values(job.allDepartmentsData || {}));
      } else if (job.fields?.[primaryDept]) {
        loadedFields = job.fields[primaryDept];
      } else if (job.allDepartmentsData && job.allDepartmentsData[primaryDept]) {
        loadedFields = job.allDepartmentsData[primaryDept];
      } else if (job.fields && typeof job.fields === 'object') {
        loadedFields = Object.assign({}, ...Object.values(job.fields));
      }
      setDeptFields(loadedFields || {});

      // Auto-detect existing revisions
      const docs = ['GA', 'SLD', 'BOQ', 'CONTROL'];
      const detectedDocs = { GA: [0], SLD: [0], BOQ: [0], CONTROL: [0], PDF: [0] };
      docs.forEach(doc => {
        const revSet = new Set([0]);
        Object.keys(loadedFields || {}).forEach(k => {
          const m = k.match(new RegExp(`^Rev R(\\d+) ${doc}`, 'i'));
          if (m) revSet.add(parseInt(m[1], 10));
        });
        detectedDocs[doc] = Array.from(revSet).sort((a, b) => a - b);
      });
      const pdfSet = new Set([0]);
      Object.keys(loadedFields || {}).forEach(k => {
        const m = k.match(/^Rev R(\d+) PDF/i) || k.match(/Client Submission Date R(\d+)/i) || k.match(/CLIENT SUBMISSION DATE R(\d+)/i);
        if (m) pdfSet.add(parseInt(m[1], 10));
      });
      detectedDocs.PDF = Array.from(pdfSet).sort((a, b) => a - b);
      setDocRevisions(detectedDocs);

      if (job.fields?.myTask) {
        setMyTask({
          estimatedEffortHours: job.fields.myTask.estimatedEffortHours || '',
          taskStartDate: job.fields.myTask.taskStartDate || new Date().toISOString().split('T')[0],
          taskTargetCompletionDate: job.fields.myTask.taskTargetCompletionDate || ''
        });
      }
    } catch (err) {
      console.error('Failed to load selected job details:', err);
      setError('Could not load existing job details from database. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-12">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 capitalize">New Job</h1>
          <p className="text-gray-500 text-xs mt-0.5">Fill all details to initialize a new job for your department</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-[7px] text-xs">
          {error}
        </div>
      )}

      {/* Top-Level Job Mode Selector (OUTSIDE Main Form Section) */}
      <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-visible relative z-30 mb-4">
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">
            Job Mode: Create New or Select Existing
          </h3>
          {selectedJobId && (
            <button
              type="button"
              onClick={() => {
                setSelectedJobId('');
                setCore(EMPTY_CORE);
                setDeptFields({});
                setCurrentJob(null);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            >
              + Switch to Create New Job (Blank)
            </button>
          )}
        </div>
        <div className="p-3 bg-slate-50/40 overflow-visible">
          <SearchableJobSelect
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelectJob={(job) => handleJobSelect(job.id)}
            onClear={() => {
              setSelectedJobId('');
              setCore(EMPTY_CORE);
              setDeptFields({});
              setCurrentJob(null);
            }}
            loading={loading}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Core Job Details */}
        <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Core Job Details</h3>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              canEditCore ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {canEditCore ? 'Editable (Marketing / Admin)' : 'Read-Only (Managed by Marketing)'}
            </span>
          </div>
          <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3.5">
            <div>
              <label className={canEditCore ? requiredLabelClass('core:jobNo') : labelClass}>
                Job Number {canEditCore && requiredMark}
              </label>
              {canEditCore ? (
                <input required value={core.jobNo} onChange={e => handleCoreChange('jobNo', e.target.value)} className={inputClass} placeholder="e.g. RA101/01" />
              ) : (
                <input type="text" readOnly value={core.jobNo || '—'} className={`${inputClass} bg-gray-100 font-medium text-gray-800 cursor-not-allowed outline-none select-all`} />
              )}
            </div>
            <div>
              <label className={canEditCore ? requiredLabelClass('core:panelName') : labelClass}>
                Panel Name {canEditCore && requiredMark}
              </label>
              {canEditCore ? (
                <select required value={core.panelName} onChange={e => handleCoreChange('panelName', e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {PANEL_NAME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type="text" readOnly value={core.panelName || '—'} className={`${inputClass} bg-gray-100 font-medium text-gray-800 cursor-not-allowed outline-none`} />
              )}
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              {canEditCore ? (
                <input type="number" value={core.qty} onChange={e => handleCoreChange('qty', e.target.value)} className={inputClass} />
              ) : (
                <input type="text" readOnly value={core.qty || '1'} className={`${inputClass} bg-gray-100 font-medium text-gray-800 cursor-not-allowed outline-none`} />
              )}
            </div>
            <div>
              <label className={canEditCore ? requiredLabelClass('core:typeOfIndustries') : labelClass}>
                Industry Type {canEditCore && requiredMark}
              </label>
              {canEditCore ? (
                <select required value={core.typeOfIndustries} onChange={e => handleCoreChange('typeOfIndustries', e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {INDUSTRY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type="text" readOnly value={core.typeOfIndustries || '—'} className={`${inputClass} bg-gray-100 font-medium text-gray-800 cursor-not-allowed outline-none`} />
              )}
            </div>
            <div>
              <label className={canEditCore ? requiredLabelClass('core:projectName') : labelClass}>
                Project Name {canEditCore && requiredMark}
              </label>
              {canEditCore ? (
                <input required value={core.projectName} onChange={e => handleCoreChange('projectName', e.target.value)} className={inputClass} placeholder="Project Name" />
              ) : (
                <input type="text" readOnly value={core.projectName || '—'} className={`${inputClass} bg-gray-100 font-medium text-gray-800 cursor-not-allowed outline-none select-all`} />
              )}
            </div>
            <div>
              <label className={labelClass}>Customer Name</label>
              {canEditCore ? (
                <select value={core.clientName} onChange={e => handleCoreChange('clientName', e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {CUSTOMER_NAME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type="text" readOnly value={core.clientName || '—'} className={`${inputClass} bg-gray-100 font-medium text-gray-800 cursor-not-allowed outline-none`} />
              )}
            </div>
            <div>
              <label className={labelClass}>Panel Type</label>
              {canEditCore ? (
                <select value={core.typeOfPanel} onChange={e => handleCoreChange('typeOfPanel', e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {PANEL_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type="text" readOnly value={core.typeOfPanel || '—'} className={`${inputClass} bg-gray-100 font-medium text-gray-800 cursor-not-allowed outline-none`} />
              )}
            </div>
            <div>
              <label className={canEditCore ? requiredLabelClass('core:responsibleEnggName') : labelClass}>
                Responsible Engineer {canEditCore && requiredMark}
              </label>
              {canEditCore ? (
                <div className="mt-1">
                  <SearchableUserSelect
                    department="marketing"
                    value={core.responsibleEnggName}
                    assignedId={core.assignedEngineerId}
                    placeholder="Select Responsible Engineer..."
                    onChange={(name, id) => {
                      handleCoreChange('responsibleEnggName', name);
                      handleCoreChange('assignedEngineerId', id);
                    }}
                  />
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2 px-3 h-[38px] bg-gray-100 border border-slate-300 rounded-[7px] text-[13px] text-gray-800 font-medium cursor-not-allowed">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{core.responsibleEnggName || 'Not Assigned'}</span>
                </div>
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
                  <textarea
                    rows={2}
                    value={core.deliveryAddress}
                    onChange={e => handleCoreChange('deliveryAddress', e.target.value)}
                    className={textareaClass}
                    placeholder="Enter delivery address..."
                  />
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
                  <textarea
                    rows={2}
                    value={deptFields['Marketing Remarks'] || ''}
                    onChange={e => handleDeptChange('Marketing Remarks', e.target.value)}
                    className={textareaClass}
                    placeholder="Enter marketing remarks..."
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Planning / Task Section (Inline & Compact) */}
        <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Planning / Task</h3>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Task Planning
            </span>
          </div>

          <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3.5">
            <div>
              <label className={labelClass}>
                Estimated Effort (Hours)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.1"
                placeholder="e.g. 8"
                value={myTask.estimatedEffortHours}
                onChange={(e) => setMyTask(prev => ({ ...prev, estimatedEffortHours: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Start Date
              </label>
              <input
                type="date"
                value={myTask.taskStartDate}
                onChange={(e) => setMyTask(prev => ({ ...prev, taskStartDate: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Target Completion
              </label>
              <input
                type="date"
                value={myTask.taskTargetCompletionDate}
                onChange={(e) => setMyTask(prev => ({ ...prev, taskTargetCompletionDate: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {(primaryDept === 'design' || showAllForms) && (
          <div className="space-y-4">
            <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 bg-emerald-50">
                <h3 className="text-sm font-bold text-emerald-900">Design - Electrical</h3>
              </div>
              <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3.5">
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

          <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-emerald-100/70 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-emerald-950">Drawing Submission Date and Engineer Name</h3>
                <p className="text-[11px] text-emerald-800 mt-0.5">Manage revisions (+ / -) independently for GA, SLD, BOQ, and CONTROL</p>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {['GA', 'SLD', 'BOQ', 'CONTROL'].map(doc => {
                const revs = docRevisions[doc] || [0];
                const maxRev = Math.max(...revs, 0);

                return (
                  <div key={doc} className="p-4 border border-gray-200 rounded-xl bg-gray-50/70 space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-green-900 bg-green-200 px-2.5 py-0.5 rounded-md">
                          {doc}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          Revisions: {revs.map(r => `R${r}`).join(', ')}
                        </span>
                      </div>
                    </div>

                    {revs.map(rev => {
                      const startKey = `Rev R${rev} ${doc} START DATE`;
                      const endKey = `Rev R${rev} ${doc} END DATE`;
                      const personKey = `Rev R${rev} ${doc} Name of Peson`;
                      const oldStartKey = `Rev R${rev} ${doc} Start Date`;
                      const oldEndKey = `Rev R${rev} ${doc} End Date`;
                      const oldPersonKey = `Rev R${rev} ${doc} Name of Person`;

                      return (
                        <div
                          key={rev}
                          className={`grid grid-cols-1 md:grid-cols-[90px_repeat(2,minmax(0,1fr))_minmax(0,1.2fr)_auto] gap-3 items-end p-3 rounded-lg border transition-all ${
                            rev === 0 ? 'bg-white border-gray-200' : 'bg-green-50/60 border-green-200'
                          }`}
                        >
                          <div className="md:pb-2.5">
                            <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${
                              rev === 0 ? 'bg-gray-100 text-gray-700' : 'bg-green-700 text-white'
                            }`}>
                              Rev R{rev}
                            </span>
                          </div>

                          <div>
                            <label className={labelClass}>Rev R{rev} {doc} START DATE</label>
                            <input
                              type="date"
                              value={deptFields[startKey] || deptFields[oldStartKey] || ''}
                              onChange={e => handleDeptChange(startKey, e.target.value)}
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <label className={labelClass}>Rev R{rev} {doc} END DATE</label>
                            <input
                              type="date"
                              value={deptFields[endKey] || deptFields[oldEndKey] || ''}
                              onChange={e => handleDeptChange(endKey, e.target.value)}
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <label className={requiredDeptLabelClass(personKey, [oldPersonKey])}>
                              Name of Peson {requiredMark}
                            </label>
                            <select
                              value={deptFields[personKey] || deptFields[oldPersonKey] || ''}
                              onChange={e => handleDeptChange(personKey, e.target.value)}
                              className={requiredDeptSelectClass(personKey, [oldPersonKey])}
                            >
                              <option value="">-- Select --</option>
                              {DEPARTMENT_USER_OPTIONS.design.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>

                          {/* + and - Action Buttons for this document row */}
                          <div className="flex items-center gap-1.5 md:pb-1">
                            {rev > 0 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDocRevision(doc, rev)}
                                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 border border-red-300 rounded-lg transition-colors cursor-pointer shadow-xs"
                                title={`Remove Rev R${rev} for ${doc}`}
                              >
                                <Minus size={14} className="stroke-[2.5]" />
                                <span>-</span>
                              </button>
                            )}

                            {rev === maxRev && (
                              <button
                                type="button"
                                onClick={() => handleAddDocRevision(doc)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-green-900 bg-green-200 hover:bg-green-300 border border-green-400 rounded-lg transition-colors cursor-pointer shadow-xs"
                                title={`Add Rev R${rev + 1} for ${doc}`}
                              >
                                <Plus size={14} className="stroke-[2.5]" />
                                <span>+ {doc} R{rev + 1}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* PDF and Client Submission Section with Revisions */}
              <div className="p-4 border border-green-200 rounded-xl bg-green-50/50 space-y-3">
                <div className="flex items-center justify-between border-b border-green-200/80 pb-2">
                  <span className="font-extrabold text-sm text-green-900">PDF & Client Submission</span>
                  <span className="text-xs text-gray-500 font-medium">
                    Revisions: {(docRevisions.PDF || [0]).map(r => `R${r}`).join(', ')}
                  </span>
                </div>

                {(docRevisions.PDF || [0]).map(rev => {
                  const maxPdfRev = Math.max(...(docRevisions.PDF || [0]), 0);
                  return (
                    <div
                      key={rev}
                      className="grid grid-cols-1 md:grid-cols-[90px_repeat(3,minmax(0,1fr))_auto] gap-3 items-end p-3 rounded-lg border border-green-200/80 bg-white"
                    >
                      <div className="md:pb-2.5">
                        <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${
                          rev === 0 ? 'bg-gray-100 text-gray-700' : 'bg-green-700 text-white'
                        }`}>
                          Rev R{rev}
                        </span>
                      </div>

                      <div>
                        <label className={labelClass}>Rev R{rev} PDF</label>
                        <input
                          type="date"
                          value={deptFields[`Rev R${rev} PDF`] || ''}
                          onChange={e => handleDeptChange(`Rev R${rev} PDF`, e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className={requiredDeptLabelClass(`Rev R${rev} PDF Name of Peson`, [`Rev R${rev} PDF Name`, `Rev R${rev} PDF Name of Person`])}>
                          Name of Peson {requiredMark}
                        </label>
                        <select
                          value={deptFields[`Rev R${rev} PDF Name of Peson`] || deptFields[`Rev R${rev} PDF Name of Person`] || deptFields[`Rev R${rev} PDF Name`] || ''}
                          onChange={e => handleDeptChange(`Rev R${rev} PDF Name of Peson`, e.target.value)}
                          className={requiredDeptSelectClass(`Rev R${rev} PDF Name of Peson`, [`Rev R${rev} PDF Name`, `Rev R${rev} PDF Name of Person`])}
                        >
                          <option value="">-- Select --</option>
                          {DEPARTMENT_USER_OPTIONS.design.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={labelClass}>CLIENT SUBMISSION DATE R{rev}</label>
                        <input
                          type="date"
                          value={deptFields[`Client Submission Date R${rev}`] || deptFields[`CLIENT SUBMISSION DATE R${rev}`] || ''}
                          onChange={e => handleDeptChange(`Client Submission Date R${rev}`, e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      <div className="flex items-center gap-1.5 md:pb-1">
                        {rev > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDocRevision('PDF', rev)}
                            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 border border-red-300 rounded-lg transition-colors cursor-pointer shadow-xs"
                            title={`Remove Rev R${rev} PDF`}
                          >
                            <Minus size={14} className="stroke-[2.5]" />
                            <span>-</span>
                          </button>
                        )}

                        {rev === maxPdfRev && (
                          <button
                            type="button"
                            onClick={() => handleAddDocRevision('PDF')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-green-900 bg-green-200 hover:bg-green-300 border border-green-400 rounded-lg transition-colors cursor-pointer shadow-xs"
                            title={`Add Rev R${rev + 1} PDF`}
                          >
                            <Plus size={14} className="stroke-[2.5]" />
                            <span>+ PDF R{rev + 1}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        )}

        {(primaryDept === 'purchase' || showAllForms) && (
          <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-purple-50">
              <h3 className="text-sm font-bold text-purple-900">Procurement Details</h3>
            </div>
            <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3.5">
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
          <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-amber-50">
              <h3 className="text-sm font-bold text-amber-900">Design - Mechanical</h3>
            </div>
            <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3.5">
              
              <div className="col-span-full border-b border-amber-100 pb-1.5 mb-1">
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Drawing & Programming</h4>
              </div>
              
              <div><label className={labelClass}>Drawing start Date</label><input type="date" value={deptFields['Drawing start Date'] || ''} onChange={e => handleDeptChange('Drawing start Date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Drawing Complete Date and Release to Programme</label><input type="date" value={deptFields['Drawing Complete Date'] || ''} onChange={e => handleDeptChange('Drawing Complete Date', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Drawign Prepare')}>Drawing Prepare {requiredMark}</label>
                <select value={deptFields['Drawign Prepare'] || ''} onChange={e => handleDeptChange('Drawign Prepare', e.target.value)} className={requiredDeptSelectClass('Drawign Prepare')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              
              <div><label className={labelClass}>Door and Service Plate Programing Date</label><input type="date" value={deptFields['Door and Service Plate'] || ''} onChange={e => handleDeptChange('Door and Service Plate', e.target.value)} className={inputClass} /></div>
              <div>
                <label className={requiredDeptLabelClass('Door and Service Plate Prepare Engineer Name')}>Door & Service Plate Prepare Engineer {requiredMark}</label>
                <select value={deptFields['Door and Service Plate Prepare Engineer Name'] || ''} onChange={e => handleDeptChange('Door and Service Plate Prepare Engineer Name', e.target.value)} className={requiredDeptSelectClass('Door and Service Plate Prepare Engineer Name')}>
                  <option value="">-- Select --</option>
                  {DEPARTMENT_USER_OPTIONS.mechanical.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
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
              
              <div><label className={labelClass}>Programming release to punching & Laser date</label><input type="date" value={deptFields['Programming release to punching & Laser date'] || deptFields['Programming release to'] || ''} onChange={e => { handleDeptChange('Programming release to punching & Laser date', e.target.value); handleDeptChange('Programming release to', e.target.value); }} className={inputClass} /></div>
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
              <div><label className={labelClass}>Panel Assembly Start Date</label><input type="date" value={deptFields['Panel Assembly Start'] || ''} onChange={e => handleDeptChange('Panel Assembly Start', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Panel Assembly Complete Date</label><input type="date" value={deptFields['Panel Assembly Complete'] || ''} onChange={e => handleDeptChange('Panel Assembly Complete', e.target.value)} className={inputClass} /></div>
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
          <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-hidden space-y-4">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-emerald-50">
              <h3 className="text-sm font-bold text-emerald-900">Production, QC & Dispatch Details</h3>
            </div>
            
            <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3.5">
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

        {/* Compact Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[7px] text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, false)}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-[#1E3F66] hover:bg-[#163050] text-white rounded-[7px] text-xs font-semibold disabled:opacity-50 transition-all shadow-xs cursor-pointer"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            <span>{saving ? 'Creating Job...' : 'Create Job'}</span>
          </button>
        </div>
      </form>

      {/* Simple & Unique Handover Modal */}
      {showHandoverModal && currentJob && (
        <SimpleHandoverModal
          job={currentJob}
          isOpen={showHandoverModal}
          onClose={() => setShowHandoverModal(false)}
          onSuccess={(updatedJob) => {
            setCurrentJob(updatedJob);
          }}
        />
      )}

      {/* ⭐ MY TASK POP-UP MODAL (Contains ONLY 3 required task fields) */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
                  <CheckSquare size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">
                    My Task Planning
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Configure effort and timeline for your own task execution
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: ONLY 3 Required Fields */}
            <div className="p-6 space-y-4">
              {taskModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                  {taskModalError}
                </div>
              )}

              {/* 1. Estimated Effort (Hours) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Estimated Effort (Hours) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  placeholder="e.g. 16.0"
                  value={taskModalDraft.estimatedEffortHours}
                  onChange={(e) => setTaskModalDraft(prev => ({ ...prev, estimatedEffortHours: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Planned total working hours for this task</span>
              </div>

              {/* 2. Task Start Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Task Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={taskModalDraft.taskStartDate}
                  onChange={(e) => setTaskModalDraft(prev => ({ ...prev, taskStartDate: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* 3. Task Target Completion Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Task Target Completion Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={taskModalDraft.taskTargetCompletionDate}
                  onChange={(e) => setTaskModalDraft(prev => ({ ...prev, taskTargetCompletionDate: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Kept strictly separate from project delivery date</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const est = parseFloat(taskModalDraft.estimatedEffortHours);
                  if (isNaN(est) || est <= 0) {
                    setTaskModalError('Estimated effort (hours) is required and must be greater than 0.');
                    return;
                  }
                  if (!taskModalDraft.taskStartDate) {
                    setTaskModalError('Task Start Date is required.');
                    return;
                  }
                  if (!taskModalDraft.taskTargetCompletionDate) {
                    setTaskModalError('Task Target Completion Date is required.');
                    return;
                  }
                  if (taskModalDraft.taskTargetCompletionDate < taskModalDraft.taskStartDate) {
                    setTaskModalError('Task Target Completion Date cannot be earlier than Task Start Date.');
                    return;
                  }
                  setMyTask({ ...taskModalDraft });
                  setIsTaskModalOpen(false);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
              >
                Save Task Info
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

