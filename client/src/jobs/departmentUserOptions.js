const uniqueNames = (values) => {
  const seen = new Set();
  return values.reduce((acc, value) => {
    const name = String(value || '').trim();
    if (!name) return acc;
    const key = name.toLowerCase();
    if (seen.has(key)) return acc;
    seen.add(key);
    acc.push(name);
    return acc;
  }, []);
};

const RAW_DEPARTMENT_USER_OPTIONS = {
  marketing: [
    'Atish', 'Bhavesh Prajapati', 'Hasmukh', 'Jagruti Parmar',
    'Jay Pandya', 'Jigar Patel', 'Krunal Patel',
    'Naim Vhora', 'Nita Bhavsar', 'Rajeshree Parmar',
    'Tajammul Solkar', 'Vaibhavi Patel', 'Keval V Shah'
  ],
  design: [
    'Aasif', 'Jaivik', 'Janak', 'Keyur', 'Kinjal',
    'Meet', 'Prince', 'Rohit', 'Keval V Shah'
  ],
  mechanical: [
    'Bhim', 'Dishant Panchal', 'Hitesh',
    'Keshav91', 'Khunit', 'Mahetab', 'Narendar', 'Nirmal',
    'Paresh', 'Rameshbhai', 'Ravi', 'Sachin', 'Suresh',
    'Virvijay', 'Keval V Shah'
  ],
  purchase: [
    'Swati Purchase', 'Swati Purchase 2', 'Purchase Admin', 'Keval V Shah'
  ],
  production: [
    'Bhim', 'Chirag Panchal', 'Gore Lal', 'Imtyaz', 'Jagat Doriya',
    'Jignesh', 'Kalu', 'Mahesh', 'MIT', 'Naval', 'Pandi Ji',
    'Piyush Gajera', 'Praveen', 'Rajveer', 'Ravinder Kalu',
    'Saurabh Nigam', 'Shailesh Chauhan',
    'Shubham Pandey', 'Sushil', 'Tejas', 'Keval V Shah'
  ],
  qcDispatch: [
    'Swati QC', 'Prod Admin', 'MIT', 'Shailesh Chauhan', 'Tejas', 'Vipul', 'Keval V Shah'
  ]
};

export const DEPARTMENT_USER_OPTIONS = Object.fromEntries(
  Object.entries(RAW_DEPARTMENT_USER_OPTIONS).map(([department, names]) => [
    department,
    uniqueNames(names)
  ])
);

export const ALL_DEPARTMENT_USER_OPTIONS = uniqueNames([
  ...DEPARTMENT_USER_OPTIONS.marketing,
  ...DEPARTMENT_USER_OPTIONS.design,
  ...DEPARTMENT_USER_OPTIONS.mechanical,
  ...DEPARTMENT_USER_OPTIONS.purchase,
  ...DEPARTMENT_USER_OPTIONS.production,
  ...DEPARTMENT_USER_OPTIONS.qcDispatch
]);

export const departmentUsersForField = (row) => {
  const label = `${row?.field || ''} ${row?.label || ''}`.toLowerCase();
  const dept = row?.sectionDepartment || row?.department;

  if (label.includes('responsible eng')) {
    return DEPARTMENT_USER_OPTIONS.marketing;
  }

  if (/as built prepared by engineer \(production\)|as built prepared by/.test(label)) {
    return DEPARTMENT_USER_OPTIONS.production;
  }

  if (/as built\(pdf\) prepared by engineer \(design\)|as built pdf prepared by engineer \(design\)|as built \(pdf\) prepared by/.test(label)) {
    return DEPARTMENT_USER_OPTIONS.design;
  }

  if (dept === 'production') {
    if (/testing|inspection|compliance|clearance|qc/.test(label)) {
      return DEPARTMENT_USER_OPTIONS.qcDispatch;
    }
    return DEPARTMENT_USER_OPTIONS.production;
  }

  if (dept === 'dispatch') {
    return DEPARTMENT_USER_OPTIONS.qcDispatch;
  }

  return DEPARTMENT_USER_OPTIONS[dept] || [];
};

export const departmentUsersForSection = (sectionKey) => {
  if (sectionKey === 'production') {
    return uniqueNames([
      ...DEPARTMENT_USER_OPTIONS.production,
      ...DEPARTMENT_USER_OPTIONS.qcDispatch
    ]);
  }
  return DEPARTMENT_USER_OPTIONS[sectionKey] || [];
};
