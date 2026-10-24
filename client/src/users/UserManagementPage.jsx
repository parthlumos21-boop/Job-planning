import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
  Users, UserPlus, Search, X, CheckCircle2, AlertCircle,
  Eye, EyeOff, Loader2, Check, Pencil, Trash2
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

  // Add / Edit user modal state
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [userSuccessMessage, setUserSuccessMessage] = useState('');
  const [userErrorMessage, setUserErrorMessage] = useState('');

  // Add / Edit user modal form fields
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

  // Open modal in create mode
  const handleOpenCreate = () => {
    setEditingUserId(null);
    setNewUserName('');
    setNewUserDepts(['marketing']);
    setNewUserRole('user');
    setNewUserPassword('password123');
    setNewUserCreateAccount(true);
    setUserErrorMessage('');
    setAddUserModalOpen(true);
  };

  // Open modal in edit mode (reuses existing form!)
  const handleOpenEdit = (user) => {
    setEditingUserId(user.id);
    setNewUserName(user.name || user.username || '');
    setNewUserDepts(user.departments && user.departments.length > 0 ? [...user.departments] : ['marketing']);
    setNewUserRole((user.role || 'user').toLowerCase());
    setNewUserPassword(user.password || 'password123');
    setNewUserCreateAccount(true);
    setUserErrorMessage('');
    setAddUserModalOpen(true);
  };

  // Delete user handler
  const handleDeleteUser = async (user) => {
    const confirmName = user.name || user.username || 'this user';
    if (!window.confirm(`Are you sure you want to delete '${confirmName}' from PostgreSQL?`)) {
      return;
    }
    const prevList = [...usersList];
    setUsersList(prev => prev.filter(u => u.id !== user.id));
    try {
      await api.delete(`/users/${user.id}`);
      setUserSuccessMessage(`User '${confirmName}' successfully deleted from PostgreSQL!`);
      setTimeout(() => setUserSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Failed to delete user:', err);
      setUsersList(prevList);
      setUserErrorMessage(err.response?.data?.detail || `Failed to delete user '${confirmName}'`);
    }
  };

  // Submit Handler: Add or Edit User
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

    // EDIT MODE
    if (editingUserId) {
      try {
        setSubmittingUser(true);
        const res = await api.put(`/users/${editingUserId}`, {
          name: cleanName,
          departments: newUserDepts,
          role: newUserRole,
          password: newUserPassword || 'password123'
        });
        const updated = res.data?.user;
        if (updated) {
          setUsersList(prev => prev.map(u => u.id === editingUserId ? { ...u, ...updated } : u));
        }
        setAddUserModalOpen(false);
        setEditingUserId(null);
        setUserSuccessMessage(`User '${cleanName}' updated successfully in PostgreSQL!`);
        setTimeout(() => setUserSuccessMessage(''), 5000);
      } catch (err) {
        console.error('Failed to update user in PostgreSQL:', err);
        setUserErrorMessage(err.response?.data?.detail || 'Failed to update user in PostgreSQL. Please try again.');
      } finally {
        setSubmittingUser(false);
      }
      return;
    }

    // CREATE MODE
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
    <div className="max-w-7xl mx-auto space-y-5 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0000AA] shadow-2xs shrink-0">
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
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 bg-[#0000AA] hover:bg-[#000088] text-white font-semibold px-4 py-2 rounded-[7px] text-xs shadow-xs hover:shadow transition-all shrink-0 cursor-pointer"
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

      {/* Roster Controls: Search & Department Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, @username, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-[36px] pl-9 pr-8 text-xs bg-white border border-slate-300 rounded-[7px] focus:outline-none focus:ring-1 focus:ring-[#0000AA] focus:border-[#0000AA] font-medium text-slate-800"
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
                  ? 'bg-[#0000AA] text-white shadow-2xs'
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
          <Loader2 size={16} className="animate-spin text-[#0000AA]" />
          <span>Loading Job Planning team members...</span>
        </div>
      ) : paginatedUsers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedUsers.map((user, idx) => {
            const depts = user.departments || [];
            const initial = (user.name || user.username || 'U').charAt(0).toUpperCase();
            const isRevealed = Boolean(showPasswordMap[user.uniqueKey]);
            const formattedDepts = depts.length > 0
              ? depts.map(d => DEPT_DISPLAY_NAMES[d.toLowerCase()] || d).join(', ')
              : 'Unassigned';

            // Distinct globally unique key to eliminate React duplicate key warnings
            const safeKey = user.uniqueKey || `${user.userType || 'u'}_${user.id}_${user.username || idx}`;

            return (
              <div
                key={safeKey}
                className="bg-white rounded-[9px] border border-slate-200 p-4 shadow-2xs hover:shadow-xs hover:border-[#0000AA]/50 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top: Avatar, Name, @username */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0000AA] to-indigo-800 text-white flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
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

                  {/* Department, Role & Password Details */}
                  <div className="space-y-1.5 pt-2.5 border-t border-slate-100 text-xs">
                    <div className="flex items-baseline gap-1 text-slate-600">
                      <span className="font-semibold text-slate-500 shrink-0">Department:</span>
                      <span className="font-medium text-slate-800 truncate" title={formattedDepts}>
                        {formattedDepts}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 text-slate-600">
                      <span className="font-semibold text-slate-500 shrink-0">Role:</span>
                      <span className="font-medium text-slate-800">
                        {user.role || 'User'}
                      </span>
                      {user.isOptimistic && (
                        <span className="ml-2 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                          Syncing...
                        </span>
                      )}
                    </div>

                    {/* Password Field inside Department and Role section */}
                    <div className="flex items-center gap-1 text-slate-600 pt-0.5">
                      <span className="font-semibold text-slate-500 shrink-0">Password:</span>
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded-[5px] border border-slate-200 select-all truncate">
                        {isRevealed ? (user.password || 'password123') : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePassword(user.uniqueKey)}
                        className="p-1 text-slate-400 hover:text-[#0000AA] rounded hover:bg-blue-50 transition-colors cursor-pointer shrink-0"
                        title={isRevealed ? "Hide password" : "Show real password from PostgreSQL"}
                      >
                        {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Row: Delete & Edit Pencil */}
                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-end text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title={`Delete ${user.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(user)}
                      className="p-1.5 text-slate-400 hover:text-[#0000AA] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title={`Edit ${user.name}`}
                    >
                      <Pencil size={15} />
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
                    ? 'bg-[#0000AA] text-white shadow-2xs'
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

      {/* Add / Edit User Modal (Existing Form Reused per Changes-7) */}
      {addUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#0000AA] text-white">
                  {editingUserId ? <Pencil size={16} /> : <UserPlus size={16} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingUserId ? 'Edit User Details' : 'Add User to Job Planning'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingUserId
                      ? 'Directly updates record in PostgreSQL tables'
                      : 'Directly adds record to PostgreSQL tables'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors cursor-pointer"
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
                  className="w-full h-[38px] px-3 rounded-[7px] border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-[#0000AA] focus:border-[#0000AA]"
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
                          className="rounded border-slate-300 text-[#0000AA] focus:ring-[#0000AA]"
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
                    className="w-full h-[38px] px-3 rounded-[7px] border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-[#0000AA] focus:border-[#0000AA] bg-white cursor-pointer"
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
                      className="w-full h-[38px] pl-3 pr-8 rounded-[7px] border border-slate-300 text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-[#0000AA] focus:border-[#0000AA] font-mono"
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
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-[7px] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="px-5 py-2 bg-[#0000AA] hover:bg-[#000088] text-white text-xs font-semibold rounded-[7px] shadow-xs disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingUser ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{submittingUser ? 'Saving...' : (editingUserId ? 'Save Changes' : 'Add User')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
