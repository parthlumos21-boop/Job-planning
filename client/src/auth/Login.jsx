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
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-r from-cyan-200 via-purple-200 to-pink-200 py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">

      <div className="relative z-10 max-w-md w-full space-y-8 bg-white/90 backdrop-blur-sm p-8 rounded-3xl shadow-xl border border-slate-200">
        <div className="flex flex-col items-center">
          <img
            src="/21.png"
            alt="Swati Switchgears logo"
            className="h-28 w-28 rounded-full object-contain"
          />

          <p className="mt-2 text-center text-[22px] font-bold text-black">
            Job Planning System
          </p>
          <p className="mt-3 text-center text-base text-gray-600 font-normal">
            Sign in to access your department workflow
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-sm text-sm text-center font-medium">{error}</div>}
          <div className="space-y-4">
            <div>
              <input
                name="username"
                type="text"
                required
                className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-indigo-300 text-indigo-900 rounded-xl focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 text-base md:text-lg font-normal"
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
                className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-indigo-300 text-indigo-900 rounded-xl focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 text-base md:text-lg font-normal"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-lg font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-md transform transition hover:-translate-y-0.5"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
