import { useAuth } from '../context/AuthContext';
import { User, Shield, Building2 } from 'lucide-react';

const DEPT_DISPLAY_NAMES = {
  marketing: 'Marketing',
  design: 'Design – Electrical',
  mechanical: 'Design – Mechanical',
  purchase: 'Procurement',
  production: 'Production & QC & Dispatch',
  dispatch: 'Production & QC & Dispatch',
};

export default function Profile() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center space-x-4">
            <div className="bg-white/20 rounded-full p-3">
              <User size={32} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{user?.username}</h2>
              <p className="text-blue-100 text-sm capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center space-x-3">
            <Shield size={20} className="text-gray-400" />
            <div>
              <div className="text-sm font-medium text-gray-500">Role</div>
              <div className="text-gray-900 capitalize font-medium">{user?.role}</div>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Building2 size={20} className="text-gray-400 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-gray-500">Departments</div>
              <div className="flex flex-wrap gap-2 mt-1">
                {[...new Set((user?.departments || []).map(dept => DEPT_DISPLAY_NAMES[dept] || dept))].map(deptName => (
                  <span key={deptName} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {deptName}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
