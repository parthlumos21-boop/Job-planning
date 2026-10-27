import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sliders, Plus, Trash2, Save, RefreshCw, CheckCircle, 
  HelpCircle, Settings, Layers, Calendar, X, Sparkles, Check,
  AlertCircle, ArrowRight, Settings2
} from 'lucide-react';
import api from '../services/api';

const DEPT_FLOW = [
  { key: 'marketing', name: 'Marketing' },
  { key: 'design', name: 'Electrical Design' },
  { key: 'mechanical', name: 'Mechanical Design' },
  { key: 'purchase', name: 'Procurement' },
  { key: 'production', name: 'Production' },
  { key: 'qc', name: 'Quality Control (QC)' },
  { key: 'dispatch', name: 'Dispatch' }
];

export default function DynamicFormulaRulesManager({ user, onClose, selectedJob, onClearSelectedJob }) {
  const [rules, setRules] = useState([]);
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingDept, setSavingDept] = useState(null);
  const [activeDept, setActiveDept] = useState('design');
  const [simulationData, setSimulationData] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase()?.includes('keval');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedJob) {
      runSimulation(selectedJob);
    } else {
      setSimulationData(null);
    }
  }, [selectedJob, activeDept, rules]);

  // Pipeline metrics calculation: department-wise totals, upstream elapsed days, and cumulative timeline
  // Kept at top level before any early returns to satisfy React Rules of Hooks
  const pipelineMetrics = useMemo(() => {
    const deptTotals = {};
    const deptUpstream = {};
    const deptCumulative = {};

    (rules || []).forEach(r => {
      const dKey = (r.department || '').toLowerCase().trim();
      if (simulationData?.timeline?.departments?.[dKey]) {
        deptTotals[dKey] = simulationData.timeline.departments[dKey].duration_days;
        const base = Number(r.base_days) || 1;
        const extra = (r.condition_modifiers || []).reduce((acc, m) => acc + (Number(m.additionalDays) || 0), 0);
        deptTotals[dKey] = Math.max(1, Math.round(base + extra));
      }
    });

    const mkt = deptTotals['marketing'] || 1;
    const elec = deptTotals['design'] || 3;
    const mech = deptTotals['mechanical'] || 2;
    const designMax = Math.max(elec, mech);
    const pur = deptTotals['purchase'] || 1;
    const prod = deptTotals['production'] || 7;
    const qc = deptTotals['qc'] || 2;
    const disp = deptTotals['dispatch'] || 1;

    deptUpstream['marketing'] = 0;
    deptCumulative['marketing'] = mkt;

    deptUpstream['design'] = mkt;
    deptCumulative['design'] = mkt + elec;

    deptUpstream['mechanical'] = mkt;
    deptCumulative['mechanical'] = mkt + mech;

    const afterDesign = mkt + designMax;
    deptUpstream['purchase'] = afterDesign;
    deptCumulative['purchase'] = afterDesign + pur;

    const afterPur = afterDesign + pur;
    deptUpstream['production'] = afterPur;
    deptCumulative['production'] = afterPur + prod;

    const afterProd = afterPur + prod;
    deptUpstream['qc'] = afterProd;
    deptCumulative['qc'] = afterProd + qc;

    const afterQc = afterProd + qc;
    deptUpstream['dispatch'] = afterQc;
    deptCumulative['dispatch'] = afterQc + disp;

    const totalPipelineDays = simulationData?.timeline?.total_working_days || (afterQc + disp);

    return {
      deptTotals,
      deptUpstream,
      deptCumulative,
      totalPipelineDays
    };
  }, [rules, simulationData]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [rulesRes, fieldsRes] = await Promise.all([
        api.get('/planning/rules'),
        api.get('/planning/field-definitions')
      ]);
      setRules(rulesRes.data || []);
      setFieldDefinitions(fieldsRes.data || []);
      if (rulesRes.data && rulesRes.data.length > 0 && !activeDept) {
        setActiveDept(rulesRes.data[0].department);
      }
    } catch (err) {
      console.error('Failed to fetch formula data:', err);
    } finally {
      setLoading(false);
    }
  };

  const runSimulation = async (job) => {
    try {
      setSimulating(true);
      const res = await api.post('/planning/simulate', {
        job_id: job.id || job.external_id
      });
      setSimulationData(res.data);
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  };

  const handleUpdateBaseDays = (dept, newBase) => {
    setRules(prev => prev.map(r => r.department === dept ? { ...r, base_days: parseInt(newBase) || 1 } : r));
  };

  const handleAddModifier = (dept) => {
    const defaultField = fieldDefinitions[0]?.field_key || 'panel_type';
    const defaultOpt = fieldDefinitions[0]?.options?.[0]?.value || 'PLC';
    const newMod = {
      field: defaultField,
      operator: 'equals',
      value: defaultOpt,
      additionalDays: 1,
      label: `Extra days for ${defaultField} = ${defaultOpt}`
    };
    setRules(prev => prev.map(r => {
      if (r.department === dept) {
        const existing = r.condition_modifiers || [];
        return { ...r, condition_modifiers: [...existing, newMod] };
      }
      return r;
    }));
  };

  const handleRemoveModifier = (dept, index) => {
    setRules(prev => prev.map(r => {
      if (r.department === dept) {
        const updated = (r.condition_modifiers || []).filter((_, idx) => idx !== index);
        return { ...r, condition_modifiers: updated };
      }
      return r;
    }));
  };

  const handleModifierChange = (dept, index, key, val) => {
    setRules(prev => prev.map(r => {
      if (r.department === dept) {
        const updated = [...(r.condition_modifiers || [])];
        const targetMod = { ...updated[index], [key]: val };

        // If field changed, set value to first valid option if select type
        if (key === 'field') {
          const fieldDef = fieldDefinitions.find(f => f.field_key === val);
          if (fieldDef?.field_type === 'select' && fieldDef.options?.length > 0) {
            targetMod.value = fieldDef.options[0].value;
          } else if (fieldDef?.field_type === 'number') {
            targetMod.value = '2';
          }
        }
        updated[index] = targetMod;
        return { ...r, condition_modifiers: updated };
      }
      return r;
    }));
  };

  const handleSaveRule = async (deptRule) => {
    try {
      setSavingDept(deptRule.department);
      await api.put(`/planning/rules/${deptRule.department}`, {
        base_days: deptRule.base_days,
        condition_modifiers: deptRule.condition_modifiers || [],
        multiplier: 1.0,
        description: deptRule.description || '',
        is_active: deptRule.is_active ?? true
      });
      alert(`Formula rule for ${deptRule.department.toUpperCase()} updated successfully!`);
      fetchInitialData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update formula rule');
    } finally {
      setSavingDept(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 bg-white border border-slate-200 text-slate-500 text-xs rounded-2xl text-center">
        Formula rule configuration is restricted to System Administrators and Keval V Shah.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500 shadow-xs">
        <RefreshCw size={14} className="animate-spin text-indigo-600" />
        <span>Loading dynamic formula rules...</span>
      </div>
    );
  }

  const selectedRule = rules.find(r => r.department === activeDept) || rules[0];
  const activeTimeline = simulationData?.timeline?.departments?.[activeDept];


  const activeDeptKey = (activeDept || '').toLowerCase().trim();
  const activeDeptTotal = pipelineMetrics.deptTotals[activeDeptKey] || selectedRule?.base_days || 1;
  const activeDeptUpstream = pipelineMetrics.deptUpstream[activeDeptKey] ?? 0;
  const activeDeptCumulative = pipelineMetrics.deptCumulative[activeDeptKey] || activeDeptTotal;

  const currentFlowIdx = DEPT_FLOW.findIndex(d => d.key === activeDeptKey);
  const precedingStages = currentFlowIdx > 0 ? DEPT_FLOW.slice(0, currentFlowIdx) : [];

  return (
    <div className="bg-white rounded-lg border border-slate-300 overflow-hidden shadow-2xs space-y-0 text-slate-800">
      {/* Top Title Bar */}
      <div className="px-4 py-2.5 bg-slate-50 text-slate-800 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-blue-700" />
          <h3 className="text-xs font-bold text-slate-800 tracking-tight">
            Dynamic Department Formula Engine Configurator
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchInitialData}
            className="flex items-center gap-1.5 h-[28px] px-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-md text-xs font-semibold border border-slate-300 cursor-pointer transition-colors shadow-2xs"
          >
            <RefreshCw size={11} className="text-slate-600" />
            <span>Reload Rules</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="h-[28px] w-[28px] flex items-center justify-center bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-300 rounded-md cursor-pointer transition-colors shadow-2xs"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Clean Department Navigation Tabs with container border radius */}
      <div className="px-3 pt-2.5 pb-2 bg-slate-50 border-b border-slate-200">
        <div className="flex bg-slate-200/70 p-1 rounded-md overflow-x-auto gap-1 border border-slate-300/60">
          {rules.map(r => {
            const dKey = (r.department || '').toLowerCase().trim();
            const dTotal = pipelineMetrics.deptTotals[dKey] || r.base_days;
            return (
              <button
                key={r.department}
                onClick={() => setActiveDept(r.department)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer whitespace-nowrap ${
                  activeDept === r.department
                    ? 'bg-white text-blue-700 border border-slate-300 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {r.department} ({dTotal}d Total)
              </button>
            );
          })}
        </div>
      </div>


      {/* Selected Job Simulation Card (If Job is selected) */}
      {selectedJob && (
        <div className="mx-3.5 mt-3 p-3 rounded-[3px] border border-blue-200 bg-blue-50/50 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-blue-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900">
                Formula Simulation for Job #{selectedJob.jobNo}
              </h4>
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-[2px]">
                Read-Only Sandbox
              </span>
            </div>
            {onClearSelectedJob && (
              <button
                onClick={onClearSelectedJob}
                className="text-xs text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                Clear Selection
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white p-2 rounded-[2px] border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Panel Type</span>
              <span className="font-bold text-slate-800">{selectedJob.typeOfPanel || selectedJob.panelName || 'Standard'}</span>
            </div>
            <div className="bg-white p-2 rounded-[2px] border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Quantity</span>
              <span className="font-bold text-slate-800">{selectedJob.qty || 1} Units</span>
            </div>
            <div className="bg-white p-2 rounded-[2px] border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Industry</span>
              <span className="font-bold text-slate-800">{selectedJob.typeOfIndustries || 'Standard'}</span>
            </div>
            <div className="bg-white p-2 rounded-[2px] border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-blue-600 block">Simulated Days</span>
              <span className="font-bold text-blue-700">
                {activeTimeline?.duration_days || selectedRule?.base_days || '—'} Working Days
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Active Stage Evaluation & Progression Strip */}
      <div className="mx-3.5 mt-3 p-2.5 bg-white rounded-lg border border-slate-200 text-xs shadow-2xs space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-[11px]">
            <span className="capitalize text-blue-700">{selectedRule?.department}</span>
            <span>Formula Evaluation:</span>
          </div>
          <span className="text-[10px] font-semibold text-slate-500">
            Preceding Stages: {activeDeptUpstream} Working Days &bull; Stage Pipeline Range: Day {activeDeptUpstream + 1} to Day {activeDeptCumulative}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preceding Upstream Department Stages Pipeline Chain */}
          {precedingStages.map((p) => {
            const pTotal = pipelineMetrics.deptTotals[p.key] || 1;
            return (
              <React.Fragment key={p.key}>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-[3px] font-semibold text-[11px] border border-slate-300 flex items-center gap-1 shadow-2xs">
                  <span className="font-bold text-slate-700">{p.name}:</span>
                  <span className="text-blue-700 font-extrabold">{pTotal}d</span>
                </span>
                <ArrowRight size={12} className="text-slate-400 shrink-0" />
              </React.Fragment>
            );
          })}

          {/* Current Department Stage Evaluation */}
          <span className="px-2 py-0.5 bg-blue-50 text-blue-900 rounded-[3px] font-semibold text-[11px] border border-blue-200 shadow-2xs">
            Base: {selectedRule?.base_days || 1}d
          </span>
          {(activeTimeline?.applied_modifiers || selectedRule?.condition_modifiers || []).map((m, idx) => (
            <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-[3px] font-semibold text-[11px] shadow-2xs">
              +{m.additionalDays}d ({m.label || `${m.field || 'rule'}=${m.value}`})
            </span>
          ))}
          <ArrowRight size={12} className="text-slate-400 shrink-0" />
          <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-[3px] font-bold text-[11px] shadow-2xs">
            {selectedRule?.department} Total: {activeDeptTotal} Working Days
          </span>

          {activeDeptKey === 'dispatch' && (
            <>
              <ArrowRight size={12} className="text-slate-400 shrink-0" />
              <span className="px-2.5 py-0.5 bg-blue-700 text-white rounded-[3px] font-extrabold text-[11px] shadow-2xs">
                Total Days (All Departments): {pipelineMetrics.totalPipelineDays} Working Days
              </span>
            </>
          )}
        </div>
      </div>

      {/* 2-Column Responsive Grid Layout */}
      {selectedRule && (
        <div className="p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column (4 cols): Formula Configuration */}
          <div className="lg:col-span-4 border border-slate-300 rounded-lg bg-white shadow-2xs overflow-hidden flex flex-col justify-between">
            <div>
              {/* Gray Section Header Bar */}
              <div className="bg-slate-100 border-b border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Formula Configuration</span>
                <span className="text-[10px] font-semibold text-slate-500 capitalize">{selectedRule.department}</span>
              </div>

              <div className="p-3.5 space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Base Working Days (Fixed Minimum)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={selectedRule.base_days}
                    onChange={(e) => handleUpdateBaseDays(selectedRule.department, e.target.value)}
                    className="w-full h-[32px] px-2.5 rounded-[3px] border border-slate-300 font-bold text-xs text-slate-900 bg-white focus:border-blue-500 focus:outline-none transition-colors"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Starting duration before any additional day rules</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Rule Description / Notes
                  </label>
                  <input
                    type="text"
                    value={selectedRule.description || ''}
                    onChange={(e) => setRules(prev => prev.map(r => r.department === selectedRule.department ? { ...r, description: e.target.value } : r))}
                    placeholder="Standard manufacturing timeline"
                    className="w-full h-[32px] px-2.5 rounded-[3px] border border-slate-300 text-xs text-slate-800 bg-white focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Classic Action Toolbar */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
              <button
                onClick={() => handleSaveRule(selectedRule)}
                disabled={savingDept === selectedRule.department}
                className="h-[32px] px-3.5 rounded-[3px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer border border-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save size={13} />
                <span>{savingDept === selectedRule.department ? 'Saving...' : 'Save Formula Rule'}</span>
              </button>
              <button
                onClick={fetchInitialData}
                className="h-[32px] px-3 rounded-[3px] bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Right Column (8 cols): Additional Working Day Rules */}
          <div className="lg:col-span-8 border border-slate-300 rounded-lg bg-white shadow-2xs overflow-hidden flex flex-col justify-between">
            <div>
              {/* Gray Section Header Bar with Add Rule Button */}
              <div className="bg-slate-100 border-b border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Additional Working Day Rules</span>
                <button
                  onClick={() => handleAddModifier(selectedRule.department)}
                  className="h-[28px] px-2.5 rounded-[3px] bg-white hover:bg-slate-50 text-blue-700 border border-slate-300 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                >
                  <Plus size={12} />
                  <span>+ Add Rule</span>
                </button>
              </div>

              {/* Conditions List / Table */}
              <div className="divide-y divide-slate-200 text-xs overflow-y-auto max-h-[380px]">
                {(selectedRule.condition_modifiers || []).length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No dynamic extra day rules configured. This department strictly uses Base Days ({selectedRule.base_days} Days).
                  </div>
                ) : (
                  selectedRule.condition_modifiers.map((mod, idx) => {
                    const currField = mod.field || mod.field_key || 'panel_type';
                    const fieldDef = fieldDefinitions.find(f => f.field_key === currField);
                    const isSelect = fieldDef?.field_type === 'select';
                    const isNumber = fieldDef?.field_type === 'number';
                    const isBoolean = fieldDef?.field_type === 'boolean';

                    return (
                      <div key={idx} className="p-2.5 flex flex-wrap items-center gap-2 hover:bg-slate-50 transition-colors">
                        {/* Job Field Selector */}
                        <div className="w-36">
                          <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Job Field</span>
                          <select
                            value={currField}
                            onChange={(e) => handleModifierChange(selectedRule.department, idx, 'field', e.target.value)}
                            className="w-full h-[30px] px-2 rounded-[3px] border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
                          >
                            {fieldDefinitions.length > 0 ? (
                              fieldDefinitions.map(f => (
                                <option key={f.field_key} value={f.field_key}>
                                  {f.field_label}
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="panel_type">Panel Type</option>
                                <option value="complexity">Complexity</option>
                                <option value="quantity">Quantity</option>
                                <option value="priority">Priority</option>
                                <option value="type_of_industries">Industry</option>
                              </>
                            )}
                          </select>
                        </div>

                        {/* Operator */}
                        <div className="w-24">
                          <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Operator</span>
                          <select
                            value={mod.operator || 'equals'}
                            onChange={(e) => handleModifierChange(selectedRule.department, idx, 'operator', e.target.value)}
                            className="w-full h-[30px] px-1.5 rounded-[3px] border border-slate-300 text-xs text-slate-700 bg-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="equals">=</option>
                            <option value="not_equals">!=</option>
                            <option value=">">&gt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<">&lt;</option>
                            <option value="<=">&lt;=</option>
                            <option value="contains">contains</option>
                          </select>
                        </div>

                        {/* Dynamic Value Input */}
                        <div className="w-36">
                          <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Condition Value</span>
                          {isSelect && fieldDef?.options?.length > 0 ? (
                            <select
                              value={mod.value || ''}
                              onChange={(e) => handleModifierChange(selectedRule.department, idx, 'value', e.target.value)}
                              className="w-full h-[30px] px-2 rounded-[3px] border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
                            >
                              {fieldDef.options.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : isBoolean ? (
                            <select
                              value={String(mod.value)}
                              onChange={(e) => handleModifierChange(selectedRule.department, idx, 'value', e.target.value === 'true')}
                              className="w-full h-[30px] px-2 rounded-[3px] border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
                            >
                              <option value="true">Yes / True</option>
                              <option value="false">No / False</option>
                            </select>
                          ) : (
                            <input
                              type={isNumber ? "number" : "text"}
                              value={mod.value ?? ''}
                              onChange={(e) => handleModifierChange(selectedRule.department, idx, 'value', e.target.value)}
                              placeholder="Value..."
                              className="w-full h-[30px] px-2 rounded-[3px] border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
                            />
                          )}
                        </div>

                        {/* Additional Days */}
                        <div className="w-20">
                          <span className="text-[10px] font-bold text-blue-700 block mb-0.5">+Days</span>
                          <input
                            type="number"
                            min="-10"
                            max="45"
                            value={mod.additionalDays ?? mod.additional_days ?? 0}
                            onChange={(e) => handleModifierChange(selectedRule.department, idx, 'additionalDays', parseInt(e.target.value) || 0)}
                            className="w-full h-[30px] px-2 rounded-[3px] border border-blue-300 text-xs font-bold text-blue-800 bg-blue-50/40 text-center"
                          />
                        </div>

                        {/* Rule Label */}
                        <div className="flex-1 min-w-[120px]">
                          <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Rule Description</span>
                          <input
                            type="text"
                            value={mod.label || mod.condition_label || ''}
                            onChange={(e) => handleModifierChange(selectedRule.department, idx, 'label', e.target.value)}
                            placeholder="e.g. Extra testing required"
                            className="w-full h-[30px] px-2 rounded-[3px] border border-slate-300 text-xs text-slate-800 bg-white focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        {/* Delete Action */}
                        <div className="flex items-end pt-3">
                          <button
                            onClick={() => handleRemoveModifier(selectedRule.department, idx)}
                            className="h-[30px] w-[30px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-[3px] border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                            title="Delete Rule"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex justify-between items-center">
              <span>{(selectedRule.condition_modifiers || []).length} rule condition(s) configured</span>
              <span className="text-slate-400">Evaluated on job creation</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
