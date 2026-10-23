import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X, Building, User, PlusCircle } from 'lucide-react';

export default function SearchableJobSelect({
  jobs = [],
  selectedJobId = '',
  onSelectJob,
  onClear,
  loading = false,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const selectedJob = jobs.find(j => String(j.id) === String(selectedJobId));

  const filteredJobs = jobs.filter(j => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().replace(/#/g, '').trim();
    const jNo = (j.jobNo || '').toLowerCase().replace(/#/g, '');
    const panel = (j.panelName || '').toLowerCase();
    const client = (j.clientName || '').toLowerCase();
    const proj = (j.projectName || '').toLowerCase();
    const engg = (j.responsibleEnggName || '').toLowerCase();
    const dept = (j.department || '').toLowerCase();

    return jNo.includes(q) || panel.includes(q) || client.includes(q) || proj.includes(q) || engg.includes(q) || dept.includes(q);
  });

  const handleSelect = (job) => {
    onSelectJob(job);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleResetToNew = () => {
    if (onClear) onClear();
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[38px] bg-white border border-slate-300 hover:border-blue-500 rounded-[7px] px-3 text-[13px] cursor-pointer shadow-2xs flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></div>
          {selectedJob ? (
            <div className="truncate text-[13px]">
              <span className="font-bold text-slate-900">Job {selectedJob.jobNo}</span>
              <span className="text-slate-400 mx-1.5">•</span>
              <span className="font-medium text-slate-700">{selectedJob.panelName || 'Panel'}</span>
              {selectedJob.clientName && (
                <>
                  <span className="text-slate-400 mx-1.5">•</span>
                  <span className="text-slate-500 text-xs">{selectedJob.clientName}</span>
                </>
              )}
            </div>
          ) : (
            <span className="text-slate-500 font-medium truncate text-[13px]">
              [Create New Job] or Search existing job to pre-fill...
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selectedJob && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleResetToNew();
              }}
              title="Clear selection and create new blank job"
              className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={15}
            className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown Menu with Internal Search Bar */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-[9px] shadow-lg z-50 overflow-hidden animate-in fade-in duration-150">
          {/* Internal Search Bar */}
          <div className="p-2 bg-slate-50 border-b border-slate-200">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Job No, Panel, Client, Project, Engineer..."
                className="w-full h-[32px] pl-8 pr-7 text-xs bg-white border border-slate-300 rounded-[6px] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Quick Option: Blank Job */}
          <div className="p-1.5 border-b border-slate-100 bg-blue-50/40">
            <button
              type="button"
              onClick={handleResetToNew}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between transition-colors ${
                !selectedJobId ? 'bg-blue-100/70 text-blue-800' : 'text-blue-700 hover:bg-blue-100/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <PlusCircle size={15} />
                <span>+ Create New Job (Blank Form)</span>
              </div>
              {!selectedJobId && <Check size={14} className="text-blue-700" />}
            </button>
          </div>

          {/* Jobs List */}
          <div className="max-h-72 overflow-y-auto p-1.5 divide-y divide-slate-100">
            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400 font-medium flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                Loading jobs from database...
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 font-medium">
                No matching jobs found in database.
              </div>
            ) : (
              filteredJobs.map(j => {
                const isSelected = String(j.id) === String(selectedJobId);
                return (
                  <div
                    key={j.id}
                    onClick={() => handleSelect(j)}
                    className={`p-2.5 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            Job {j.jobNo}
                          </span>
                          <span className="font-bold text-xs text-blue-900 truncate">
                            {j.panelName || 'Unnamed Panel'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                          {j.clientName && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Building size={12} className="text-slate-400 shrink-0" />
                              <span className="truncate">{j.clientName}</span>
                            </div>
                          )}
                          {j.responsibleEnggName && (
                            <div className="flex items-center gap-1.5 truncate">
                              <User size={12} className="text-slate-400 shrink-0" />
                              <span className="truncate">Engg: {j.responsibleEnggName}</span>
                            </div>
                          )}
                        </div>

                        {j.projectName && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            Project: {j.projectName}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {j.department && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                            {j.department}
                          </span>
                        )}
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
