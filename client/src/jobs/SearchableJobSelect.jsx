import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X, PlusCircle } from 'lucide-react';

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
        className="w-full h-[32px] bg-white border border-slate-300 hover:border-[#0000AA] rounded-md px-2.5 text-xs cursor-pointer shadow-2xs flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#0000AA] shrink-0"></div>
          {selectedJob ? (
            <div className="truncate text-xs">
              <span className="font-bold text-slate-900">Job {selectedJob.jobNo}</span>
              <span className="text-slate-400 mx-1">•</span>
              <span className="font-medium text-slate-700">{selectedJob.panelName || 'Panel'}</span>
              {selectedJob.clientName && (
                <>
                  <span className="text-slate-400 mx-1">•</span>
                  <span className="text-slate-500 text-[11px]">{selectedJob.clientName}</span>
                </>
              )}
            </div>
          ) : (
            <span className="text-slate-500 font-medium truncate text-xs">
              [Create New Job] or Search existing job to pre-fill...
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1.5">
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
              <X size={13} />
            </button>
          )}
          <ChevronDown
            size={13}
            className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown Menu with Internal Search Bar */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden animate-in fade-in duration-150">
          {/* Internal Search Bar */}
          <div className="p-1.5 bg-slate-50 border-b border-slate-200">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Job No, Panel, Client, Project, Engineer..."
                className="w-full h-[28px] pl-7 pr-6 text-xs bg-white border border-slate-300 rounded-[5px] focus:outline-none focus:ring-1 focus:ring-[#0000AA] focus:border-[#0000AA] font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Quick Option: Blank Job */}
          <div className="p-1 border-b border-slate-100 bg-blue-50/30">
            <button
              type="button"
              onClick={handleResetToNew}
              className={`w-full text-left px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center justify-between transition-colors ${
                !selectedJobId ? 'bg-blue-100/70 text-[#0000AA]' : 'text-blue-700 hover:bg-blue-100/50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <PlusCircle size={12} />
                <span>+ Create New Job (Blank Form)</span>
              </div>
              {!selectedJobId && <Check size={12} className="text-[#0000AA]" />}
            </button>
          </div>

          {/* Jobs List */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-slate-100">
            {loading ? (
              <div className="py-4 text-center text-xs text-slate-400 font-medium flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-[#0000AA] border-t-transparent rounded-full animate-spin"></span>
                Loading jobs from database...
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400 font-medium">
                No matching jobs found in database.
              </div>
            ) : (
              filteredJobs.map(j => {
                const isSelected = String(j.id) === String(selectedJobId);
                return (
                  <div
                    key={j.id}
                    onClick={() => handleSelect(j)}
                    className={`px-2.5 py-1.5 rounded-md cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50/90 border border-blue-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                        <span className="font-bold text-[10px] text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                          #{j.jobNo}
                        </span>
                        <span className="font-bold text-[11.5px] text-slate-900 truncate">
                          {j.panelName || 'Unnamed Panel'}
                        </span>
                        {j.clientName && (
                          <>
                            <span className="text-slate-300 hidden sm:inline">•</span>
                            <span className="text-[11px] text-slate-600 truncate">{j.clientName}</span>
                          </>
                        )}
                        {j.responsibleEnggName && (
                          <>
                            <span className="text-slate-300 hidden sm:inline">•</span>
                            <span className="text-[10px] text-slate-400 truncate">Engg: {j.responsibleEnggName}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {j.department && (
                          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                            {j.department}
                          </span>
                        )}
                        {isSelected && (
                          <div className="w-3.5 h-3.5 rounded-full bg-[#0000AA] text-white flex items-center justify-center shrink-0">
                            <Check size={9} strokeWidth={3} />
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
