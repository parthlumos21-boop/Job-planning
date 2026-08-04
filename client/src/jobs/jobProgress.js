const DEPARTMENT_PROGRESS = [
  {
    key: 'marketing',
    name: 'Marketing',
    color: '#FCA5A5', // Red
    fields: [
      ['jobNo', 'Job No.'],
      ['panelName', 'Name of Panel'],
      ['clientName'],
      ['qty', 'Qty.'],
      ['typeOfIndustries', 'Type of Industries'],
      ['projectName', 'Project Name'],
      ['incomerRating', 'Incomer Rating'],
      ['typeOfPanel', 'Type of Panel', 'Type of Panel TTA/NON TTA'],
      ['responsibleEnggName', 'Responsible Engg. Name'],
      ['poNo', 'Purchase Order'],
      ['poDate', 'Purchase Order Date'],
      ['deliveryPeriod', 'Delivery Period', 'Delivery Period as per P.O'],
      ['deliveryDate', 'Delivery Date', 'Delivery Date as per P.O.'],
      ['dataGivenToDesign', 'Data Given To Design', 'Data Given To Design Dept.'],
      ['deliveryAddress', 'Delivery Address'],
      ['contactPerson', 'Contact Person', 'Contact Person & Ph. No.'],
      ['Contact Number'],
      ['Transportation'],
      ['Packing'],
      ['Inspection Call date'],
      ['Marketing Remarks']
    ]
  },
  {
    key: 'design',
    name: 'Design',
    color: '#D8B4FE', // Purple
    fields: [
      ['Design Planned Date', 'Planned Date', 'Electrical Planning Register'],
      ['Drawing Submission Date', 'Drawing Submission Date', 'Drawing Submission Register'],
      ['Drawing Submission Engineer Name', 'Drawing Submission Engineer Name', 'Drawing Submission Register'],
      ['Rev R0 GA Start Date', 'Rev R0 GA START DATE', 'GA Drawing Register'],
      ['Rev R0 GA End Date', 'Rev R0 GA END DATE', 'GA Drawing Register'],
      ['Rev R0 GA Name of Peson', 'Rev R0 GA Name of Person', 'GA Drawing Register'],
      ['Rev R0 SLD Start Date', 'Rev R0 SLD START DATE', 'SLD Drawing Register'],
      ['Rev R0 SLD End Date', 'Rev R0 SLD END DATE', 'SLD Drawing Register'],
      ['Rev R0 SLD Name of Peson', 'Rev R0 SLD Name of Person', 'SLD Drawing Register'],
      ['Rev R0 BOQ Start Date', 'Rev R0 BOQ START DATE', 'BOQ Register'],
      ['Rev R0 BOQ End Date', 'Rev R0 BOQ END DATE', 'BOQ Register'],
      ['Rev R0 BOQ Name of Peson', 'Rev R0 BOQ Name of Person', 'BOQ Register'],
      ['Rev R0 CONTROL Start Date', 'Rev R0 CONTROL START DATE', 'Control Drawing Register'],
      ['Rev R0 CONTROL End Date', 'Rev R0 CONTROL END DATE', 'Control Drawing Register'],
      ['Rev R0 CONTROL Name of Peson', 'Rev R0 CONTROL Name of Person', 'Control Drawing Register'],
      ['Rev R0 PDF', 'Rev R0 PDF Date', 'Revision R0 Register'],
      ['Rev R0 PDF Name of Peson', 'Rev R0 PDF Name of Person', 'Revision R0 Register'],
      ['Client Submission Date R0', 'CLIENT SUBMISSION DATE R0', 'Revision R0 Register'],
      ['Rev R1 GA Start Date', 'Rev R1 GA START DATE', 'Revision R1 Register'],
      ['Rev R1 GA End Date', 'Rev R1 GA END DATE', 'Revision R1 Register'],
      ['Rev R1 GA Name of Peson', 'Rev R1 GA Name of Person', 'Revision R1 Register'],
      ['Rev R1 SLD Start Date', 'Rev R1 SLD START DATE', 'Revision R1 Register'],
      ['Rev R1 SLD End Date', 'Rev R1 SLD END DATE', 'Revision R1 Register'],
      ['Rev R1 SLD Name of Peson', 'Rev R1 SLD Name of Person', 'Revision R1 Register'],
      ['Rev R1 BOQ Start Date', 'Rev R1 BOQ START DATE', 'Revision R1 Register'],
      ['Rev R1 BOQ End Date', 'Rev R1 BOQ END DATE', 'Revision R1 Register'],
      ['Rev R1 BOQ Name of Peson', 'Rev R1 BOQ Name of Person', 'Revision R1 Register'],
      ['Rev R1 CONTROL Start Date', 'Rev R1 CONTROL START DATE', 'Revision R1 Register'],
      ['Rev R1 CONTROL End Date', 'Rev R1 CONTROL END DATE', 'Revision R1 Register'],
      ['Rev R1 CONTROL Name of Peson', 'Rev R1 CONTROL Name of Person', 'Revision R1 Register'],
      ['Rev R1 PDF', 'Rev R1 PDF Date', 'Revision R1 Register'],
      ['Rev R1 PDF Name of Peson', 'Rev R1 PDF Name of Person', 'Revision R1 Register'],
      ['Client Submission Date R1', 'CLIENT SUBMISSION DATE R1', 'Revision R1 Register'],
      ['Rev R2 GA Start Date', 'Rev R2 GA START DATE', 'Revision R2 Register'],
      ['Rev R2 GA End Date', 'Rev R2 GA END DATE', 'Revision R2 Register'],
      ['Rev R2 GA Name of Peson', 'Rev R2 GA Name of Person', 'Revision R2 Register'],
      ['Rev R2 SLD Start Date', 'Rev R2 SLD START DATE', 'Revision R2 Register'],
      ['Rev R2 SLD End Date', 'Rev R2 SLD END DATE', 'Revision R2 Register'],
      ['Rev R2 SLD Name of Peson', 'Rev R2 SLD Name of Person', 'Revision R2 Register'],
      ['Rev R2 BOQ Start Date', 'Rev R2 BOQ START DATE', 'Revision R2 Register'],
      ['Rev R2 BOQ End Date', 'Rev R2 BOQ END DATE', 'Revision R2 Register'],
      ['Rev R2 BOQ Name of Peson', 'Rev R2 BOQ Name of Person', 'Revision R2 Register'],
      ['Rev R2 CONTROL Start Date', 'Rev R2 CONTROL START DATE', 'Revision R2 Register'],
      ['Rev R2 CONTROL End Date', 'Rev R2 CONTROL END DATE', 'Revision R2 Register'],
      ['Rev R2 CONTROL Name of Peson', 'Rev R2 CONTROL Name of Person', 'Revision R2 Register'],
      ['Rev R2 PDF', 'Rev R2 PDF Date', 'Revision R2 Register'],
      ['Rev R2 PDF Name of Peson', 'Rev R2 PDF Name of Person', 'Revision R2 Register'],
      ['Client Submission Date R2', 'CLIENT SUBMISSION DATE R2', 'Revision R2 Register'],
      ['Final Approved Drawings Received Date', 'Final Approved Drawings', 'Client Approval Register'],
      ['BOM Released To Purchase', 'BOM Released To ERP System', 'BOM Release Register'],
      ['SO No. of ERP System', 'SO No. of ERP System', 'ERP SO Register'],
      ['BOM Prepare Engnieer Name', 'BOM Prepare Engnieer Name', 'BOM Release Register']
    ]
  },
  {
    key: 'mechanical',
    name: 'Mechanical',
    color: '#93C5FD', // Blue
    fields: [
      ['Drawing start Date', 'Drawing start Date', 'Mechanical Drawing Register'],
      ['Drawing Complete Date', 'Drawing Complete Date', 'Mechanical Drawing Register'],
      ['Drawign Prepare', 'Drawign Prepare', 'Mechanical Drawing Register'],
      ['Door and Service Plate', 'Door and Service Plate', 'Door & Service Plate Register'],
      ['Drafting File Handover Date', 'Drafting File Handover Date', 'Drafting Register'],
      ['DFT Prepare Engineer', 'DFT Prepare Engineer', 'Drafting Register'],
      ['Release to programme', 'Release to programme', 'Programme Release Register'],
      ['Programme Start date', 'Programme Start date', 'Programming Register'],
      ['Programme End date', 'Programme End date', 'Programming Register'],
      ['Programmer Engineer Name', 'Programmer Engineer Name', 'Programming Register'],
      ['Programming release to', 'Programming release to', 'Programming Register'],
      ['Puching & Laser Start', 'Puching & Laser Start', 'Programming Register'],
      ['Puching & Laser End', 'Puching & Laser End', 'Programming Register'],
      ['Fabrication Release Date', 'Fabrication Release Date', 'Fabrication Release Register'],
      ['Swati / Oursource Fabricator Name', 'Swati / Outsource', 'Fabrication Release Register'],
      ['Fabrication Prepare Engnieer Name', 'Fabrication Prepare Engnieer Name', 'Fabrication Release Register'],
      ['Door Details Sent Date', 'Door Details Sent Date', 'Door Details Register'],
      ['Door Details Prepare Engineer Name', 'Door Details Prepare Engineer Name', 'Door Details Register'],
      ['EXECUTION FILE DATE', 'Execution File Date', 'Execution File Register'],
      ['EXECUTION (PDF) PREPARED ENGINEER', 'Execution (PDF)', 'Execution File Register'],
      ['AS BUILT SUBMISSION DATE', 'As Built Submission', 'As Built Drawing Register'],
      ['AS BUILT PREPARED BY ENGINEER (PRODUCTION)', 'As Built Prepared By', 'As Built Drawing Register'],
      ['AS BUILT(PDF) PREPARED BY ENGINEER (DESIGN)', 'As Built (PDF) Prepared By', 'As Built Drawing Register'],
      // Keep other fields just in case they are used somewhere else
      ['Bending start date', 'Bending start date'],
      ['Bending complete', 'Bending complete'],
      ['Welding start date', 'Welding start date'],
      ['Welding complete', 'Welding complete'],
      ['Name of Fabricator', 'Name of Fabricator'],
      ['Name of Fabrication Engineer', 'Name of Fabrication Engineer'],
      ['Release to Painting', 'Release to Painting'],
      ['Recived to painting', 'Recived to painting'],
      ['Name of painter', 'Name of painter'],
      ['Panel Assembly Start', 'Panel Assembly Start'],
      ['Panel Assembly Complete', 'Panel Assembly Complete'],
      ['Name of Assembler', 'Name of Assembler'],
      ['Painting and Asembley Responsible Job engg. Name', 'Painting and Asembley']
    ]
  },
  {
    key: 'purchase',
    name: 'Purchase',
    color: '#86EFAC', // Green
    fields: [
      ['Expected Date of Handover (Material)'],
      ['Actual Date of Handover (Material)'],
      ['Purchase Target Date'],
      ['Material Available Date'],
      ['Responsible Engineer For Procurement (Name)']
    ]
  },
  {
    key: 'production',
    name: 'Production',
    color: '#67E8F9', // Cyan
    fields: [
      ['Responsible Job Engineer', 'Responsible Job engg. Name'],
      ['Busbar Work Start Date', 'Busbar work start date'],
      ['Busbar Work Complete Date', 'Busbar work complete'],
      ['Responsible Fitter', 'Name of responsible Fiter'],
      ['Wiring Start Date', 'Wiring start Date'],
      ['Wiring Complete Date', 'Wiring Complete Date'],
      ['Responsible Wireman', 'Name of ressponsible wireman'],
      ['Testing Start Date', 'Testing start date'],
      ['Testing Complete Date', 'Testing completedate'],
      ['Testing Done By Engineer', 'Testing done by engg.'],
      ['Actual Inspection Date', 'Actual Inspection date'],
      ['Compliance / Dispatch Clearance Date', 'Compliance/ Dispatch clearence Date'],
      // Old aliases to prevent data loss
      ['Date of Pre-Wiring Start', 'Pre-Wiring Start'],
      ['Date of Pre-Wiring End', 'Pre-Wiring End'],
      ['Done By'],
      ['Busbar Done By'],
      ['Start Date Busbar'],
      ['End Date Busbar'],
      ['Fiter'],
      ['Wireman'],
      ['Start Date Internal Wiring'],
      ['End Date Internal Wiring'],
      ['Inspection Internal / Quality Start Date', 'Internal Quality Start'],
      ['Inspection Internal / Quality End Date', 'Internal Quality End'],
      ['Internal Checked By'],
      ['Inspection Offered To Client', 'Offered To Client'],
      ['Inspection Date Call', 'Inspection Call Date'],
      ['Client Inspected By', 'Inspected By'],
      ['Inspection Result (Ok/Not-Ok)', 'Inspection Result'],
      ['Visual Update To Project Manager'],
      ['Fabrication Work Completion Date'],
      ['Fabricator Name'],
      ['Painter Name'],
      ['Painting Start Date'],
      ['Painting End Date'],
      ['Assembler Name'],
      ['Assembling Start Date'],
      ['Assembling End Date'],
      ['As Built Submission Date'],
      ['As Built Prepared By Engineer (Production)'],
      ['As Built PDF Prepared By Engineer (Design)']
    ]
  },
  {
    key: 'dispatch',
    name: 'Dispatch',
    color: '#67E8F9', // Cyan
    fields: [
      ['Packing Start Date', 'Packing start date'],
      ['Packing Complete Date', 'Packing complete date'],
      ['Name of Responsible Person Checked Before Packing', 'Name of responsible person cheked'],
      ['Dispatch Date', 'Dispatch date'],
      // Old aliases
      ['Dispatch Expected Date', 'Expected Date'],
      ['Dispatch Actual Date', 'Actual Date'],
      ['Packing Done By'],
      ['Photos Provide To Manager After Packing Date']
    ]
  }
];

const DEPARTMENT_OVERVIEW = [
  { key: 'marketing', name: 'Marketing', color: '#EF4444', bgClass: 'bg-red-50', borderClass: 'border-red-200', textClass: 'text-red-800', departments: ['marketing'] },
  { key: 'design', name: 'Design- Electrical', color: '#A855F7', bgClass: 'bg-purple-50', borderClass: 'border-purple-200', textClass: 'text-purple-800', departments: ['design'] },
  { key: 'mechanical', name: 'Design- Mechanical', color: '#3B82F6', bgClass: 'bg-blue-50', borderClass: 'border-blue-200', textClass: 'text-blue-800', departments: ['mechanical'] },
  { key: 'purchase', name: 'Procurement', color: '#22C55E', bgClass: 'bg-green-50', borderClass: 'border-green-200', textClass: 'text-green-800', departments: ['purchase'] },
  { key: 'production', name: 'Production & QC & Dispatch', color: '#06B6D4', bgClass: 'bg-cyan-50', borderClass: 'border-cyan-200', textClass: 'text-cyan-800', departments: ['production', 'dispatch'] }
];

const FIELD_LABELS = {
  jobNo: 'Job No.',
  panelName: 'Name of Panel',
  clientName: 'Customer Name',
  qty: 'Qty.',
  typeOfIndustries: 'Type of Industries',
  projectName: 'Project Name',
  incomerRating: 'Incomer Rating',
  typeOfPanel: 'Panel Type',
  responsibleEnggName: 'Responsible Engg. Name',
  poNo: 'Purchase Order',
  poDate: 'Purchase Order Date',
  deliveryPeriod: 'Delivery Period',
  deliveryDate: 'Delivery Date',
  dataGivenToDesign: 'Data Given To Design',
  deliveryAddress: 'Delivery Address',
  contactPerson: 'Contact Person*',
  'Design Planned Date': 'Planned Date.',
  'Rev R0 GA Start Date': 'Rev R0 GA START DATE',
  'Rev R0 GA End Date': 'Rev R0 GA END DATE',
  'Rev R0 GA Name of Peson': 'Name of Peson',
  'Rev R0 SLD Start Date': 'Rev R0 SLD START DATE',
  'Rev R0 SLD End Date': 'Rev R0 SLD END DATE',
  'Rev R0 SLD Name of Peson': 'Name of Peson',
  'Rev R0 BOQ Start Date': 'Rev R0 BOQ START DATE',
  'Rev R0 BOQ End Date': 'Rev R0 BOQ END DATE',
  'Rev R0 BOQ Name of Peson': 'Name of Peson',
  'Rev R0 CONTROL Start Date': 'Rev R0 CONTROL START DATE',
  'Rev R0 CONTROL End Date': 'Rev R0 CONTROL END DATE',
  'Rev R0 CONTROL Name of Peson': 'Name of Peson',
  'Rev R0 PDF Name of Peson': 'Rev R0 PDF Name of Peson',
  'Client Submission Date R0': 'CLIENT SUBMISSION DATE R0',
  'Rev R1 GA Start Date': 'Rev R1 GA START DATE',
  'Rev R1 GA End Date': 'Rev R1 GA END DATE',
  'Rev R1 GA Name of Peson': 'Name of Peson',
  'Rev R1 SLD Start Date': 'Rev R1 SLD START DATE',
  'Rev R1 SLD End Date': 'Rev R1 SLD END DATE',
  'Rev R1 SLD Name of Peson': 'Name of Peson',
  'Rev R1 BOQ Start Date': 'Rev R1 BOQ START DATE',
  'Rev R1 BOQ End Date': 'Rev R1 BOQ END DATE',
  'Rev R1 BOQ Name of Peson': 'Name of Peson',
  'Rev R1 CONTROL Start Date': 'Rev R1 CONTROL START DATE',
  'Rev R1 CONTROL End Date': 'Rev R1 CONTROL END DATE',
  'Rev R1 CONTROL Name of Peson': 'Name of Peson',
  'Rev R1 PDF Name of Peson': 'Rev R1 PDF Name of Peson',
  'Client Submission Date R1': 'CLIENT SUBMISSION DATE R1',
  'Rev R2 GA Start Date': 'Rev R2 GA START DATE',
  'Rev R2 GA End Date': 'Rev R2 GA END DATE',
  'Rev R2 GA Name of Peson': 'Name of Peson',
  'Rev R2 SLD Start Date': 'Rev R2 SLD START DATE',
  'Rev R2 SLD End Date': 'Rev R2 SLD END DATE',
  'Rev R2 SLD Name of Peson': 'Name of Peson',
  'Rev R2 BOQ Start Date': 'Rev R2 BOQ START DATE',
  'Rev R2 BOQ End Date': 'Rev R2 BOQ END DATE',
  'Rev R2 BOQ Name of Peson': 'Name of Peson',
  'Rev R2 CONTROL Start Date': 'Rev R2 CONTROL START DATE',
  'Rev R2 CONTROL End Date': 'Rev R2 CONTROL END DATE',
  'Rev R2 CONTROL Name of Peson': 'Name of Peson',
  'Rev R2 PDF Name of Peson': 'Rev R2 PDF Name of Peson',
  'Client Submission Date R2': 'CLIENT SUBMISSION DATE R2',
  'Drawing Complete Date': 'Drawing Complete',
  'Door and Service Plate': 'Door and Panel Service Plate',
  'Drafting File Handover Date': 'Drafing File Handover',
  'DFT Prepare Engineer': 'DPT Prepare Engineer',
  'Programmer Engineer Name': 'Programmer Engineer',
  'Puching & Laser End': 'Puchnig & Laser',
  'Name of Fabrication Engineer': 'Name of Fabrication',
  'Panel Assembly Start': 'Panel Assembly',
  'Panel Assembly Complete': 'Panel Assembly',
  'Painting and Asembley Responsible Job engg. Name': 'Painting and Asembley',
  'Responsible Job Engineer': 'Responsible Job engg. Name',
  'Busbar Work Start Date': 'Busbar work start date',
  'Busbar Work Complete Date': 'Busbar work complete',
  'Responsible Fitter': 'Name of responsible Fiter',
  'Wiring Start Date': 'Wiring start Date',
  'Wiring Complete Date': 'Wiring Complete Date',
  'Responsible Wireman': 'Name of ressponsible wireman',
  'Testing Start Date': 'Testing start date',
  'Testing Complete Date': 'Testing completedate',
  'Testing Done By Engineer': 'Testing done by engg.',
  'Actual Inspection Date': 'Actual Inspection date',
  'Compliance / Dispatch Clearance Date': 'Compliance/ Dispatch clearence Date',
  'Packing Start Date': 'Packing start date',
  'Packing Complete Date': 'Packing complete date',
  'Name of Responsible Person Checked Before Packing': 'Name of responsible person cheked',
  'Dispatch Date': 'Dispatch date'
};

const CORE_FIELDS = new Set([
  'jobNo',
  'panelName',
  'clientName',
  'qty',
  'typeOfIndustries',
  'projectName',
  'incomerRating',
  'typeOfPanel',
  'responsibleEnggName',
  'poNo',
  'poDate',
  'deliveryPeriod',
  'deliveryDate',
  'dataGivenToDesign',
  'deliveryAddress',
  'contactPerson'
]);

const titleCaseLabel = (value) => {
  const spaced = String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return FIELD_LABELS[spaced] || FIELD_LABELS[value] || spaced;
};

const labelForAliases = (aliases) => {
  const excelReadable = aliases.find((field) => /START DATE|END DATE|CLIENT SUBMISSION|BOM Released To Purchase|Swati \/ Oursource|EXECUTION|AS BUILT|Name of Peson/i.test(field));
  const readable = excelReadable || aliases.find((field) => !/^[a-z]+[A-Z]/.test(field)) || aliases[0];
  return titleCaseLabel(readable);
};

const groupNameForField = (departmentKey, field, label) => {
  if (departmentKey === 'marketing') return 'Marketing Department';
  if (departmentKey === 'purchase') return 'Purchase Department';
  if (departmentKey === 'production') return 'Production Department / QC Department';
  if (departmentKey === 'dispatch') return 'Dispatch Department';
  if (departmentKey === 'mechanical') return 'Mechanical/Fabricator/Assembly Department';
  if (departmentKey === 'design') return 'Electrical Design Department';
  return 'Department Details';
};

const hasValue = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
};

const valueByLooseKey = (source, key) => {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  const needle = String(key).trim().toLowerCase();
  const foundKey = Object.keys(source).find((sourceKey) => sourceKey.trim().toLowerCase() === needle);
  return foundKey ? source[foundKey] : undefined;
};

const keyByLooseKey = (source, key) => {
  if (!source || typeof source !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(source, key)) return key;
  const needle = String(key).trim().toLowerCase();
  return Object.keys(source).find((sourceKey) => sourceKey.trim().toLowerCase() === needle) || '';
};

const isDateLabel = (value) => /date|submission|received|release|complete|start|end|inspection|dispatch|packing/i.test(String(value || ''));

const formatDateValue = (value) => {
  if (!hasValue(value)) return '';
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const compactMatch = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (compactMatch) {
    const [, d, m, rawYear] = compactMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return trimmed;
};

const hasAnyField = (job, department, aliases) => {
  const deptFields = job?.fields?.[department] || {};
  return aliases.some((field) => hasValue(valueByLooseKey(job, field)) || hasValue(valueByLooseKey(deptFields, field)));
};

export const buildJobProgressData = (job) => {
  return DEPARTMENT_PROGRESS.map((department) => {
    const filled = department.fields.filter((aliases) => hasAnyField(job, department.key, aliases)).length;
    const total = department.fields.length || 1;
    return {
      key: department.key,
      name: department.name,
      color: department.color,
      filled,
      total,
      progress: Math.round((filled / total) * 100)
    };
  });
};

export const buildJobProgressSections = (job) => {
  return DEPARTMENT_OVERVIEW.map((section) => {
    const fieldRows = section.departments.flatMap((departmentKey) => {
      const department = DEPARTMENT_PROGRESS.find((item) => item.key === departmentKey);
      if (!department) return [];
      return department.fields.map((aliases) => {
        const label = labelForAliases(aliases);
        const prefixedLabel = section.departments.length > 1
          ? `${department.name}: ${label}`
          : label;
        return {
          label: prefixedLabel,
          completed: hasAnyField(job, departmentKey, aliases)
        };
      });
    });

    const completedLabels = fieldRows.filter((field) => field.completed).map((field) => field.label);
    const remainingLabels = fieldRows.filter((field) => !field.completed).map((field) => field.label);
    const total = fieldRows.length || 1;

    return {
      ...section,
      completedLabels,
      remainingLabels,
      completed: completedLabels.length,
      remaining: remainingLabels.length,
      total,
      progress: Math.round((completedLabels.length / total) * 100)
    };
  });
};

export const buildDepartmentFieldRows = (job, sectionKey) => {
  const section = DEPARTMENT_OVERVIEW.find((item) => item.key === sectionKey);
  const departments = section?.departments || [sectionKey].filter(Boolean);

  return departments.flatMap((departmentKey) => {
    const department = DEPARTMENT_PROGRESS.find((item) => item.key === departmentKey);
    if (!department) return [];

    return department.fields.map((aliases) => {
      const label = labelForAliases(aliases);
      const coreAlias = aliases.find((alias) => CORE_FIELDS.has(alias));
      const deptFields = job?.fields?.[departmentKey] || {};
      const source = coreAlias ? job : deptFields;
      const fallbackAlias = aliases.find((alias) => keyByLooseKey(source, alias)) || aliases[0];
      const field = coreAlias || fallbackAlias;
      const storedField = keyByLooseKey(source, field) || field;
      const rawValue = valueByLooseKey(source, field);
      const value = isDateLabel(`${field} ${label}`) ? formatDateValue(rawValue) : rawValue;

      return {
        department: coreAlias ? 'core' : departmentKey,
        sectionDepartment: departmentKey,
        sectionName: department.name,
        groupName: groupNameForField(departmentKey, field, label),
        field: storedField,
        label,
        value: value ?? '',
        rawValue: rawValue ?? '',
        completed: hasValue(value)
      };
    });
  });
};

export const getAssociatedDateField = (departmentKey, fieldKey) => {
  const department = DEPARTMENT_PROGRESS.find((item) => item.key === departmentKey);
  if (!department) return null;

  const fields = department.fields;
  const personIndex = fields.findIndex((aliases) => 
    aliases.some(alias => String(alias).toLowerCase() === String(fieldKey).toLowerCase())
  );
  if (personIndex === -1) return null;

  // look backwards first (up to 3 fields)
  for (let i = personIndex - 1; i >= Math.max(0, personIndex - 3); i--) {
    const aliases = fields[i];
    const label = aliases[0];
    if (isDateLabel(label)) return label;
  }

  // look forwards if not found
  for (let i = personIndex + 1; i <= Math.min(fields.length - 1, personIndex + 3); i++) {
    const aliases = fields[i];
    const label = aliases[0];
    if (isDateLabel(label)) return label;
  }

  return null;
};

export { DEPARTMENT_PROGRESS, DEPARTMENT_OVERVIEW };
