import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#F5F8FC] py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">

      <div className="relative z-10 max-w-md w-full space-y-8 bg-white p-8 rounded-3xl shadow-xl border border-[#DCE5F0]">
        <div className="flex flex-col items-center">
          <img
            src="/21.png"
            alt="Swati Switchgears logo"
            className="h-28 w-28 rounded-full object-contain drop-shadow-sm"
          />

          <p className="mt-4 text-center text-[22px] font-black text-[#172B4D] tracking-tight">
            Job Planning System
          </p>
          <p className="mt-1 text-center text-sm text-[#64748B] font-medium">
            Sign in to access your department workflow
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && <div className="bg-[#FEE2E2] border border-[#B91C1C]/20 text-[#B91C1C] p-3 rounded-xl text-xs text-center font-bold">{error}</div>}
          <div className="space-y-4">
            <div>
              <input
                name="username"
                type="text"
                required
                className="appearance-none relative block w-full px-4 py-3 border border-[#DCE5F0] placeholder-[#64748B]/60 text-[#172B4D] bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0000AA]/20 focus:border-[#0000AA] focus:z-10 text-sm font-medium"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <input
                name="password"
                type="password"
                required
                className="appearance-none relative block w-full px-4 py-3 border border-[#DCE5F0] placeholder-[#64748B]/60 text-[#172B4D] bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0000AA]/20 focus:border-[#0000AA] focus:z-10 text-sm font-medium"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-[#0000AA] hover:bg-[#000088] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0000AA] shadow-xs transition-all cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
