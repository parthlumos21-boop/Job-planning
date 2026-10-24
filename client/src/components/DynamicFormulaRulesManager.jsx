import React, { useState, useEffect } from 'react';
import { 
  Sliders, Plus, Trash2, Save, RefreshCw, CheckCircle, 
  HelpCircle, Settings, Layers, Calendar, X
} from 'lucide-react';
import axios from 'axios';

export default function DynamicFormulaRulesManager({ user, onClose }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingDept, setSavingDept] = useState(null);
  const [activeDept, setActiveDept] = useState('design');

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase()?.includes('keval');

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/planning/rules', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRules(res.data || []);
      if (res.data && res.data.length > 0 && !activeDept) {
        setActiveDept(res.data[0].department);
      }
    } catch (err) {
      console.error('Failed to fetch formula rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBaseDays = (dept, newBase) => {
    setRules(prev => prev.map(r => r.department === dept ? { ...r, base_days: parseInt(newBase) || 1 } : r));
  };

  const handleUpdateMultiplier = (dept, newMult) => {
    setRules(prev => prev.map(r => r.department === dept ? { ...r, multiplier: parseFloat(newMult) || 1.0 } : r));
  };

  const handleAddModifier = (dept) => {
    const newMod = {
      field: 'complexity',
      operator: 'equals',
      value: 'high',
      additionalDays: 1,
      label: 'Custom Complexity Rule'
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

  const handleModifierChange = (dept, index, fieldKey, val) => {
    setRules(prev => prev.map(r => {
      if (r.department === dept) {
        const updated = [...(r.condition_modifiers || [])];
        updated[index] = { ...updated[index], [fieldKey]: val };
        return { ...r, condition_modifiers: updated };
      }
      return r;
    }));
  };

  const handleSaveRule = async (deptRule) => {
    try {
      setSavingDept(deptRule.department);
      const token = localStorage.getItem('token');
      await axios.put(`/api/planning/rules/${deptRule.department}`, {
        base_days: deptRule.base_days,
        condition_modifiers: deptRule.condition_modifiers || [],
        multiplier: deptRule.multiplier || 1.0,
        description: deptRule.description || '',
        is_active: deptRule.is_active ?? true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`Formula rule for ${deptRule.department.toUpperCase()} updated successfully!`);
      fetchRules();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update formula rule');
    } finally {
      setSavingDept(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 bg-slate-50 text-slate-500 text-xs rounded-xl text-center">
        Formula rule configuration is restricted to System Administrators and Keval V Shah.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500">
        <RefreshCw size={14} className="animate-spin text-indigo-600" />
        <span>Loading dynamic formula rules...</span>
      </div>
    );
  }

  const selectedRule = rules.find(r => r.department === activeDept) || rules[0];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-0">
      {/* Header */}
      <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-indigo-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Dynamic Department Formula Engine Configurator
            </h3>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Tweak Base Days and condition weight modifiers without changing codebase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRules}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
          >
            <RefreshCw size={12} />
            <span>Reload Rules</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl cursor-pointer transition-all"
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Department Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto p-1.5 gap-1.5">
        {rules.map(r => (
          <button
            key={r.department}
            onClick={() => setActiveDept(r.department)}
            className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer whitespace-nowrap ${
              activeDept === r.department
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {r.department} ({r.base_days}d Base)
          </button>
        ))}
      </div>

      {/* Active Rule Details */}
      {selectedRule && (
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Base Working Days (Fixed Min)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={selectedRule.base_days}
                onChange={(e) => handleUpdateBaseDays(selectedRule.department, e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-sm text-slate-900 bg-white"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Starting duration before modifiers</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Batch Scale Multiplier
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="3.0"
                value={selectedRule.multiplier}
                onChange={(e) => handleUpdateMultiplier(selectedRule.department, e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-sm text-slate-900 bg-white"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Scale factor (Default: 1.0)</span>
            </div>

            <div className="flex flex-col justify-end">
              <button
                onClick={() => handleSaveRule(selectedRule)}
                disabled={savingDept === selectedRule.department}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all disabled:opacity-50"
              >
                <Save size={14} />
                <span>{savingDept === selectedRule.department ? 'Saving...' : 'Save Formula Rule'}</span>
              </button>
            </div>
          </div>

          {/* Condition Modifiers List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Condition Modifiers (+Additional Working Days)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Triggered when matching job parameters (e.g. High Complexity, VFD panel, Qty &gt; 2)
                </p>
              </div>
              <button
                onClick={() => handleAddModifier(selectedRule.department)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-200 cursor-pointer"
              >
                <Plus size={13} />
                <span>Add Modifier Rule</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
              {(selectedRule.condition_modifiers || []).length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No dynamic modifiers configured. Department will strictly use Base Days.
                </div>
              ) : (
                selectedRule.condition_modifiers.map((mod, idx) => (
                  <div key={idx} className="p-3.5 flex flex-wrap items-center gap-3 bg-white hover:bg-slate-50/60">
                    <div className="flex-1 min-w-[140px]">
                      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Label / Description</span>
                      <input
                        type="text"
                        value={mod.label || ''}
                        onChange={(e) => handleModifierChange(selectedRule.department, idx, 'label', e.target.value)}
                        placeholder="Rule label..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
                      />
                    </div>

                    <div className="w-32">
                      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Job Field</span>
                      <select
                        value={mod.field}
                        onChange={(e) => handleModifierChange(selectedRule.department, idx, 'field', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-medium bg-white"
                      >
                        <option value="complexity">complexity</option>
                        <option value="panel_type">panel_type</option>
                        <option value="quantity">quantity</option>
                        <option value="revision_required">revision_required</option>
                        <option value="has_customer_specs">has_customer_specs</option>
                        <option value="is_large_enclosure">is_large_enclosure</option>
                        <option value="has_imported_components">has_imported_components</option>
                        <option value="third_party_inspection">third_party_inspection</option>
                      </select>
                    </div>

                    <div className="w-24">
                      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Operator</span>
                      <select
                        value={mod.operator}
                        onChange={(e) => handleModifierChange(selectedRule.department, idx, 'operator', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-medium bg-white"
                      >
                        <option value="equals">equals</option>
                        <option value="in">in</option>
                        <option value=">">&gt;</option>
                        <option value=">=">&gt;=</option>
                      </select>
                    </div>

                    <div className="w-28">
                      <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Target Value</span>
                      <input
                        type="text"
                        value={Array.isArray(mod.value) ? mod.value.join(',') : (mod.value ?? '')}
                        onChange={(e) => {
                          const val = mod.operator === 'in' ? e.target.value.split(',').map(s => s.trim()) : (e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value);
                          handleModifierChange(selectedRule.department, idx, 'value', val);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
                      />
                    </div>

                    <div className="w-24">
                      <span className="text-[10px] font-bold text-indigo-700 block mb-0.5">+Days</span>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={mod.additionalDays}
                        onChange={(e) => handleModifierChange(selectedRule.department, idx, 'additionalDays', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded-lg border border-indigo-200 text-xs font-black text-indigo-700 bg-indigo-50/50"
                      />
                    </div>

                    <div className="flex items-end pt-3">
                      <button
                        onClick={() => handleRemoveModifier(selectedRule.department, idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Modifier"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
