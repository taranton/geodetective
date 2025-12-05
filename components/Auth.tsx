import React, { useState } from 'react';
import { apiService } from '../services/apiService';
import { User } from '../types';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      if (isLogin) {
        const user = await apiService.login(username, password);
        onLogin(user);
      } else {
        const result = await apiService.register(username, password);
        setSuccessMsg(result.message || "Registration successful! Please wait for an administrator to approve your account.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="mb-6">
            <h2 className="text-3xl font-bold text-white mb-2">{isLogin ? 'Welcome Back' : 'Join GeoDetective'}</h2>
            <p className="text-slate-400">{isLogin ? 'Enter your credentials to access the terminal.' : 'Create an account to request access.'}</p>
        </div>

        {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                {error}
            </div>
        )}
        {successMsg && (
             <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-800 rounded-lg text-emerald-400 text-sm">
             {successMsg}
         </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-colors"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
          >
            {isLoading ? 'Please wait...' : (isLogin ? 'Login' : 'Register Request')}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-6">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); setSuccessMsg(''); }}
            className="text-sm text-emerald-500 hover:text-emerald-400"
          >
            {isLogin ? "Need an account? Register" : "Already have an account? Login"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;