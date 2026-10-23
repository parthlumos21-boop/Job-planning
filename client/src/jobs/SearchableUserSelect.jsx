import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Search, ChevronDown, Check, User, Loader2 } from 'lucide-react';

export default function SearchableUserSelect({
  value,
  assignedId,
  onChange,
  department = null,
  placeholder = 'Select engineer...',
  required = false,
  className = '',
  disabled = false
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    async function loadUsers() {
      try {
        setLoading(true);
        const params = department ? { department } : {};
        const res = await api.get('/users', { params });
        if (isMounted) {
          const list = Array.isArray(res.data) ? res.data : [];
          const seen = new Set();
          const deduped = list.filter(item => {
            const k = item.uniqueKey || `${item.id}-${item.name}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          setUsers(deduped);
        }
      } catch (err) {
        console.error('Failed to load users for dropdown:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadUsers();
    return () => { isMounted = false; };
  }, [department]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = (u.name || '').toLowerCase().includes(q);
    const userMatch = (u.username || '').toLowerCase().includes(q);
    return nameMatch || userMatch;
  });

  const selectedUser = users.find(u => 
    (assignedId && u.id === assignedId) || 
    (value && (u.name?.toLowerCase() === value.toLowerCase() || u.username?.toLowerCase() === value.toLowerCase()))
  );

  const displayLabel = selectedUser?.name || value || '';

  const handleSelect = (user) => {
    if (onChange) {
      onChange(user.name, user.id);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {/* Selected Box */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`w-full h-[38px] flex items-center justify-between px-3 text-[13px] bg-white border rounded-[7px] shadow-2xs transition-colors text-left ${
          isOpen ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'bg-slate-100 cursor-not-allowed text-slate-500' : 'cursor-pointer text-slate-800'}`}
      >
        <span className="flex items-center gap-2 truncate">
          <User size={15} className="text-slate-400 shrink-0" />
          <span className={displayLabel ? 'font-medium text-slate-900 truncate' : 'text-slate-400'}>
            {displayLabel || placeholder}
          </span>
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2">
            <Search size={14} className="text-slate-400 shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by engineer name..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none py-1"
            />
          </div>

          {/* List Options */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-slate-50">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin text-blue-500" />
                <span>Loading active engineers...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                {searchQuery ? `No engineers matching "${searchQuery}"` : 'No active engineers available'}
              </div>
            ) : (
              filteredUsers.map((u, idx) => {
                const isSelected = selectedUser?.id === u.id || (!selectedUser && value && u.name?.toLowerCase() === value.toLowerCase());
                const optKey = u.uniqueKey || `${u.userType || 'user'}_${u.id}_${u.username || u.name}_${idx}`;
                return (
                  <button
                    key={optKey}
                    type="button"
                    onClick={() => handleSelect(u)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors text-left ${
                      isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {(u.name || u.username || 'U')[0].toUpperCase()}
                      </div>
                      <span className="truncate">{u.name || u.username}</span>
                      {u.departments && u.departments.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-normal">
                          {u.departments[0]}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
