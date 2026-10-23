import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
  Users, UserPlus, Search, X, CheckCircle2, AlertCircle,
  Eye, EyeOff, Loader2
} from 'lucide-react';

const DEPT_DISPLAY_NAMES = {
  marketing: 'Marketing',
  design: 'Design - Electrical',
  mechanical: 'Design - Mechanical',
  purchase: 'Procurement',
  production: 'Production & QC & Dispatch',
  dispatch: 'Production & QC & Dispatch',
  qc: 'Production & QC & Dispatch'
};

const AVAILABLE_DEPTS_OPTIONS = [
  { key: 'marketing', label: 'Marketing' },
  { key: 'design', label: 'Design - Electrical' },
  { key: 'mechanical', label: 'Design - Mechanical' },
  { key: 'purchase', label: 'Procurement' },
  { key: 'production', label: 'Production & QC & Dispatch' }
];

const ITEMS_PER_PAGE = 12;

export default function UserManagementPage() {
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  // Password visibility map: { [uniqueKey]: boolean }
  const [showPasswordMap, setShowPasswordMap] = useState({});

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Add user modal state
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [userSuccessMessage, setUserSuccessMessage] = useState('');
  const [userErrorMessage, setUserErrorMessage] = useState('');

  // Add user modal form fields
  const [newUserName, setNewUserName] = useState('');
  const [newUserDepts, setNewUserDepts] = useState(['marketing']);
  const [newUserRole, setNewUserRole] = useState('user');
  const [newUserCreateAccount, setNewUserCreateAccount] = useState(true);
  const [newUserPassword, setNewUserPassword] = useState('password123');
  const [showModalPassword, setShowModalPassword] = useState(false);

  // Fetch users from backend
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users');
      setUsersList(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Department counts
  const deptUserCounts = useMemo(() => {
    const counts = { total: usersList.length };
    AVAILABLE_DEPTS_OPTIONS.forEach(d => { counts[d.key] = 0; });
    usersList.forEach(u => {
      (u.departments || []).forEach(dept => {
        const clean = dept.toLowerCase();
        if (counts[clean] !== undefined) counts[clean]++;
      });
    });
    return counts;
  }, [usersList]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return usersList.filter(u => {
      const q = searchTerm.toLowerCase().trim();
      const nameMatch = !q || (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
      const deptMatch = deptFilter === 'all' || (u.departments || []).some(d => d.toLowerCase() === deptFilter.toLowerCase());
      return nameMatch && deptMatch;
    });
  }, [usersList, searchTerm, deptFilter]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, deptFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE) || 1;
  const paginatedUsers = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  // Generate page numbers to show
  const visiblePageNumbers = useMemo(() => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }, [currentPage, totalPages]);

  // Toggle password visibility for a card
  const togglePassword = (uniqueKey) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [uniqueKey]: !prev[uniqueKey]
    }));
  };

  // Optimistic Add User Handler
  const handleAddUserSubmit = async (e) => {
    e.preventDefault();
    const cleanName = newUserName.trim();
    if (!cleanName) {
      setUserErrorMessage('Please enter a valid user or engineer name.');
      return;
    }
    if (newUserDepts.length === 0) {
      setUserErrorMessage('Please select at least one department.');
      return;
    }

    const tempKey = `optimistic_${Date.now()}`;
    const optimisticUser = {
      id: tempKey,
      externalId: tempKey,
      name: cleanName,
      username: cleanName,
      departments: [...newUserDepts],
      role: newUserRole === 'admin' ? 'Admin' : 'User',
      password: newUserPassword || 'password123',
      userType: newUserCreateAccount ? 'account' : 'user',
      uniqueKey: tempKey,
      isOptimistic: true
    };

    // 1. Optimistic UI update: Insert immediately at the top
    setUsersList(prev => [optimisticUser, ...prev]);
    setAddUserModalOpen(false);
    setUserErrorMessage('');
    setUserSuccessMessage(`User '${cleanName}' added (Syncing with PostgreSQL...)`);

    // Reset inputs
    setNewUserName('');
    setNewUserDepts(['marketing']);
    setNewUserRole('user');
    setNewUserPassword('password123');
    setNewUserCreateAccount(true);

    // 2. Perform background API call
    try {
      setSubmittingUser(true);
      const res = await api.post('/users', {
        name: cleanName,
        departments: newUserDepts,
        role: newUserRole,
        createAccount: newUserCreateAccount,
        password: newUserPassword || 'password123'
      });

      const confirmedUser = res.data?.user;
      if (confirmedUser) {
        setUsersList(prev => prev.map(u => u.uniqueKey === tempKey ? { ...confirmedUser, isOptimistic: false } : u));
      }
      setUserSuccessMessage(`User '${cleanName}' successfully saved in PostgreSQL!`);
      setTimeout(() => setUserSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Failed to save user in PostgreSQL:', err);
      // Rollback optimistic item on failure
      setUsersList(prev => prev.filter(u => u.uniqueKey !== tempKey));
      setUserSuccessMessage('');
      setUserErrorMessage(err.response?.data?.detail || 'Failed to save user in PostgreSQL. Please try again.');
    } finally {
      setSubmittingUser(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
            <Users size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Job Planning Users & Team Management
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Direct user assignment, credentials, and departmental permissions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setUserErrorMessage('');
              setAddUserModalOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-[#1E3F66] hover:bg-[#163050] text-white font-semibold px-4 py-2 rounded-[7px] text-xs shadow-xs hover:shadow transition-all shrink-0 cursor-pointer"
          >
            <UserPlus size={15} />
            <span>+ Add User to Job Planning</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {userSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-[7px] flex items-center justify-between text-emerald-800 text-xs font-semibold animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{userSuccessMessage}</span>
          </div>
          <button onClick={() => setUserSuccessMessage('')} className="text-emerald-600 hover:text-emerald-800 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {userErrorMessage && (
        <div className="bg-rose-50 border border-rose-200 px-4 py-3 rounded-[7px] flex items-center justify-between text-rose-800 text-xs font-semibold animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{userErrorMessage}</span>
          </div>
          <button onClick={() => setUserErrorMessage('')} className="text-rose-600 hover:text-rose-800 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Department Breakdown Mini-Pills */}
      <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Team Members by Department ({deptUserCounts.total} Total)
          </span>
          <span className="text-[11px] font-medium text-slate-400">
            Click any department to filter roster
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {AVAILABLE_DEPTS_OPTIONS.map(dept => {
            const count = deptUserCounts[dept.key] || 0;
            const isSelected = deptFilter === dept.key;
            return (
              <button
                key={dept.key}
                type="button"
                onClick={() => setDeptFilter(prev => prev === dept.key ? 'all' : dept.key)}
                className={`p-2.5 rounded-[7px] border text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-400 ring-1 ring-blue-400 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-tight truncate">
                    {dept.label.split(' - ')[0]}
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    isSelected ? 'bg-[#1E3F66] text-white' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {count}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                  {count === 1 ? '1 member' : `${count} members`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Roster Controls: Search & Department Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, @username, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-[36px] pl-9 pr-8 text-xs bg-white border border-slate-300 rounded-[7px] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-800"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setDeptFilter('all')}
            className={`px-3 py-1.5 rounded-[7px] text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
              deptFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All ({deptUserCounts.total})
          </button>
          {AVAILABLE_DEPTS_OPTIONS.map(d => (
            <button
              key={d.key}
              onClick={() => setDeptFilter(d.key)}
              className={`px-2.5 py-1.5 rounded-[7px] text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                deptFilter === d.key
                  ? 'bg-[#1E3F66] text-white shadow-2xs'
                  : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {d.label.split(' - ')[0]} ({deptUserCounts[d.key] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Responsive Cards Grid */}
      {loading ? (
        <div className="bg-white rounded-[9px] border border-slate-200 p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin text-blue-600" />
          <span>Loading Job Planning team members...</span>
        </div>
      ) : paginatedUsers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedUsers.map((user) => {
            const depts = user.departments || [];
            const initial = (user.name || user.username || 'U').charAt(0).toUpperCase();
            const isRevealed = Boolean(showPasswordMap[user.uniqueKey]);
            const formattedDepts = depts.length > 0
              ? depts.map(d => DEPT_DISPLAY_NAMES[d.toLowerCase()] || d).join(', ')
              : 'Unassigned';

            return (
              <div
                key={user.uniqueKey || user.id}
                className="bg-white rounded-[9px] border border-slate-200 p-4 shadow-2xs hover:shadow-xs hover:border-blue-400 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top: Avatar, Name, @username */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {user.name}
                      </h3>
                      <p className="text-xs text-slate-400 truncate">
                        @{user.username || user.name}
                      </p>
                    </div>
                  </div>

                  {/* Department & Role Details */}
                  <div className="space-y-1.5 pt-2.5 border-t border-slate-100 text-xs">
                    <div className="flex items-baseline gap-1 text-slate-600">
                      <span className="font-semibold text-slate-500 shrink-0">Department:</span>
                      <span className="font-medium text-slate-800 truncate" title={formattedDepts}>
                        {formattedDepts}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                        {user.role || 'User'}
                      </span>
                      {user.isOptimistic && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                          Syncing...
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Password Line with Eye Icon */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-500">Password:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-[5px] border border-slate-200 select-all">
                      {isRevealed ? (user.password || 'password123') : '••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePassword(user.uniqueKey)}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors cursor-pointer"
                      title={isRevealed ? "Hide password" : "Show real password from PostgreSQL"}
                    >
                      {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-[9px] border border-slate-200 p-12 text-center text-slate-400 text-xs">
          No team members found matching your search.
        </div>
      )}

      {/* Pagination Controls */}
      {filteredUsers.length > 0 && (
        <div className="bg-white rounded-[9px] border border-slate-200 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500 font-medium">
            Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}</strong> of <strong>{filteredUsers.length}</strong> users • Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1.5">
            {/* First Button */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-[7px] font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              First
            </button>

            {/* Numbered Page Buttons */}
            {visiblePageNumbers.map(pageNum => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`min-w-[32px] h-[32px] px-2 rounded-[7px] font-semibold text-xs transition-colors cursor-pointer ${
                  currentPage === pageNum
                    ? 'bg-[#1E3F66] text-white shadow-2xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {pageNum}
              </button>
            ))}

            {/* Last Button */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1.5 rounded-[7px] font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {addUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#1E3F66] text-white">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add User to Job Planning</h3>
                  <p className="text-[11px] text-slate-500">Directly adds record to PostgreSQL tables</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                  Full Name / Engineer Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Patel"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full h-[38px] px-3 rounded-[7px] border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                  Departments <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-[7px]">
                  {AVAILABLE_DEPTS_OPTIONS.map(dept => {
                    const checked = newUserDepts.includes(dept.key);
                    return (
                      <label key={dept.key} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewUserDepts(prev => [...prev, dept.key]);
                            } else {
                              setNewUserDepts(prev => prev.filter(d => d !== dept.key));
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{dept.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                    System Role
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full h-[38px] px-3 rounded-[7px] border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="user">User</option>
                    <option value="admin">Administrator</option>
                    <option value="executive">Executive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                    Password <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showModalPassword ? 'text' : 'password'}
                      required
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full h-[38px] pl-3 pr-8 rounded-[7px] border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModalPassword(!showModalPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showModalPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAddUserModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-[7px] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="px-5 py-2 bg-[#1E3F66] hover:bg-[#163050] text-white text-xs font-semibold rounded-[7px] shadow-xs disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingUser ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{submittingUser ? 'Adding...' : 'Add User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
