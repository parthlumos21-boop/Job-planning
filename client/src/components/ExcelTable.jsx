import React, { useState } from 'react';
import { DEPARTMENT_PROGRESS, getAssociatedDateField } from '../jobs/jobProgress';
import {
  CUSTOMER_NAME_OPTIONS,
  INDUSTRY_OPTIONS,
  PANEL_NAME_OPTIONS,
  PANEL_TYPE_OPTIONS
} from '../jobs/jobDropdownOptions';
import { ALL_DEPARTMENT_USER_OPTIONS, DEPARTMENT_USER_OPTIONS } from '../jobs/departmentUserOptions';
import api from '../services/api';

const isDateField = (fieldLabel) => /date|submission|received|release|complete|start|end|inspection|dispatch|packing/i.test(fieldLabel) || /^Rev R\d+ PDF$/i.test(fieldLabel);

const isDepartmentUserField = (field, label) => {
  const key = `${field} ${label}`.toLowerCase();
  const isPersonField = /(engg|engineer|person|peson|fitter|fiter|wireman|fabricator|painter|assembler|prepared by|done by|checked by)/.test(key)
    && !key.includes('panel name')
    && !key.includes('name of panel');
  return field === 'responsibleEnggName' || isPersonField;
};

const optionsForField = (field, label) => {
  if (field === 'clientName' || field === 'Customer Name') return CUSTOMER_NAME_OPTIONS;
  if (field === 'panelName' || field === 'Name of Panel') return PANEL_NAME_OPTIONS;
  if (field === 'typeOfIndustries' || field === 'Type of Industries') return INDUSTRY_OPTIONS;
  if (field === 'typeOfPanel') return PANEL_TYPE_OPTIONS;
  if (field === 'responsibleEnggName' || field === 'Responsible Engg. Name') return DEPARTMENT_USER_OPTIONS.marketing;
  if (isDepartmentUserField(field, label)) return ALL_DEPARTMENT_USER_OPTIONS;
  return null;
};

const displayFieldValue = (value, fieldLabel) => {
  const val = String(value || '').trim();
  if (!val || !isDateField(fieldLabel)) return val;
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}-${month}-${year}`;
  }
  return val;
};

export default function ExcelTable({ jobs, onJobUpdated, user, hideActions = false, onRowClick, filterDepartments }) {
  const [editingCell, setEditingCell] = useState(null); // { jobId, department, field }
  const [editValue, setEditValue] = useState('');

  const isKeval = user?.username?.toLowerCase() === 'keval v shah';
  const isAdmin = user?.role === 'admin' || user?.role === 'executive';
  
  let allowedDepartments = DEPARTMENT_PROGRESS;
  if (!isKeval && !isAdmin && user?.departments?.length > 0) {
    allowedDepartments = DEPARTMENT_PROGRESS.filter(dept => user.departments.includes(dept.key));
  }
  
  if (filterDepartments) {
    allowedDepartments = allowedDepartments.filter(dept => filterDepartments.includes(dept.key));
  }

  const handleEditClick = (job, department, field, currentValue) => {
    setEditingCell({ jobId: job.id || job._id, department, field });
    setEditValue(currentValue || '');
  };

  const handleSave = async (job) => {
    if (!editingCell) return;
    const { department, field } = editingCell;
    const jobId = editingCell.jobId;
    
    setEditingCell(null);

    if (onJobUpdated) {
      onJobUpdated(jobId, department, field, editValue);
    }

    try {
      await api.patch(`/jobs/${jobId}/field`, { department, field, value: editValue });

      if (editValue && isDepartmentUserField(field)) {
        const dateField = getAssociatedDateField(department, field);
        if (dateField) {
          const deptData = department === 'marketing' ? job : (job.allDepartmentsData?.[department] || job.fields?.[department] || {});
          if (!deptData[dateField]) {
            const today = new Date().toISOString().split('T')[0];
            if (onJobUpdated) onJobUpdated(jobId, department, dateField, today);
            await api.patch(`/jobs/${jobId}/field`, { department, field: dateField, value: today });
          }
        }
      }
    } catch (err) {
      console.error('Failed to update field', err);
    }
  };

  const handleKeyDown = (e, job) => {
    if (e.key === 'Enter') {
      handleSave(job);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  return (
    <div className="w-full overflow-x-auto bg-white border border-gray-300 shadow-sm" style={{ maxHeight: '80vh' }}>
      <table className="w-max min-w-full text-center border-collapse text-xs whitespace-nowrap">
        <thead className="sticky top-0 z-20 bg-white">
          {/* Super Headers (Departments) */}
          <tr>
            {jobs.length > 1 && !hideActions && (
              <th className="border border-gray-300 bg-gray-100 p-2 text-center font-bold sticky left-0 z-30" colSpan={1}>
                Actions
              </th>
            )}
            {allowedDepartments.map(dept => (
              <th 
                key={dept.key}
                colSpan={dept.fields.length}
                className="border border-gray-300 p-2 text-center font-bold text-slate-800 uppercase tracking-wider"
                style={{ backgroundColor: dept.color }}
              >
                {dept.name}
              </th>
            ))}
          </tr>
          {/* Sub-Section Headers (Registers) */}
          <tr>
            {jobs.length > 1 && !hideActions && (
              <th className="border border-gray-300 bg-gray-50 p-2 font-semibold text-gray-700 sticky left-0 z-30 min-w-[80px] text-center" rowSpan={2}>
                Job No
              </th>
            )}
            {allowedDepartments.map(dept => {
              const groups = [];
              let currentGroup = null;
              dept.fields.forEach(f => {
                const sub = f[2] || '';
                if (!currentGroup || currentGroup.name !== sub) {
                  currentGroup = { name: sub, count: 1 };
                  groups.push(currentGroup);
                } else {
                  currentGroup.count++;
                }
              });
              
              return groups.map((g, i) => (
                <th 
                  key={`${dept.key}-sub-${i}`}
                  colSpan={g.count}
                  className="border border-gray-300 bg-gray-100 p-1 text-center font-semibold text-gray-700 text-[11px] uppercase tracking-wide truncate"
                  title={g.name}
                >
                  {g.name}
                </th>
              ));
            })}
          </tr>
          {/* Sub Headers (Fields) */}
          <tr>
            {allowedDepartments.map(dept => 
              dept.fields.map(f => {
                const label = f[1] || f[0];
                return (
                  <th key={`${dept.key}-${f[0]}`} className="border border-gray-300 bg-gray-50 p-2 font-semibold text-gray-700 max-w-[200px] truncate text-center" title={label}>
                    {label}
                  </th>
                );
              })
            )}
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={100} className="border border-gray-300 p-8 text-center text-gray-500 text-sm">
                No jobs found.
              </td>
            </tr>
          ) : (
            jobs.map(job => (
              <tr 
                key={job.id || job._id} 
                className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                onClick={() => onRowClick && onRowClick(job)}
              >
                {jobs.length > 1 && !hideActions && (
                  <td className="border border-gray-300 p-2 sticky left-0 bg-white group-hover:bg-blue-50/50 z-10 text-center font-bold">
                    <a href={`/jobs/${job.id || job._id}`} className="text-blue-600 hover:underline px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors">
                      {job.jobNo || 'Open'}
                    </a>
                  </td>
                )}
                {allowedDepartments.map(dept => 
                  dept.fields.map(f => {
                    const field = f[0];
                    const label = f[1] || f[0];
                    const isCore = dept.key === 'marketing';
                    
                    let currentValue = '';
                    if (isCore) {
                      currentValue = job[field];
                    } else if (job.allDepartmentsData && job.allDepartmentsData[dept.key] && job.allDepartmentsData[dept.key][field] !== undefined) {
                      currentValue = job.allDepartmentsData[dept.key][field];
                    } else if (job.fields && job.fields[dept.key]) {
                      currentValue = job.fields[dept.key][field];
                    }
                    
                    if (currentValue === undefined || currentValue === null) {
                      currentValue = '';
                    }

                    const isEditing = editingCell && editingCell.jobId === (job.id || job._id) && editingCell.department === dept.key && editingCell.field === field;
                    
                    return (
                      <td 
                        key={`${dept.key}-${field}`} 
                        className={`border border-gray-300 p-0 min-w-[120px] max-w-[250px] ${isEditing ? 'bg-blue-50 ring-1 ring-blue-500' : 'hover:bg-gray-100 cursor-text'}`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (!isEditing) handleEditClick(job, dept.key, field, currentValue);
                        }}
                      >
                        {isEditing ? (
                          <div className="flex h-full w-full">
                            {optionsForField(field, label) ? (
                              <select
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleSave(job)}
                                onKeyDown={(e) => handleKeyDown(e, job)}
                                className="w-full h-full p-2 outline-none bg-transparent text-xs"
                              >
                                <option value="">Select...</option>
                                {optionsForField(field, label).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : isDateField(label) ? (
                              <input
                                autoFocus
                                type="date"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleSave(job)}
                                onKeyDown={(e) => handleKeyDown(e, job)}
                                className="w-full h-full p-2 outline-none bg-transparent text-xs"
                              />
                            ) : (
                              <input
                                autoFocus
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleSave(job)}
                                onKeyDown={(e) => handleKeyDown(e, job)}
                                className="w-full h-full p-2 outline-none bg-transparent text-xs"
                              />
                            )}
                          </div>
                        ) : (
                          <div className="p-2 truncate" title={String(currentValue)}>
                            {displayFieldValue(currentValue, label) || '-'}
                          </div>
                        )}
                      </td>
                    );
                  })
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
