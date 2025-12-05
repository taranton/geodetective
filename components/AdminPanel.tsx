import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { User, SystemSettings } from '../types';

const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({ searchCost: 0 });
  const [editingCredits, setEditingCredits] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersData, settingsData] = await Promise.all([
        apiService.getAllUsers(),
        apiService.getSystemSettings()
      ]);
      setUsers(usersData);
      setSettings(settingsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleApproval = async (user: User) => {
    if (user.role === 'admin') return;
    try {
      await apiService.updateUser(user.id, { isApproved: !user.isApproved });
      await refreshData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateCredits = async (userId: string) => {
    try {
      await apiService.updateUser(userId, { credits: creditAmount });
      setEditingCredits(null);
      await refreshData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateCost = async (cost: number) => {
    try {
      await apiService.updateSystemSettings({ searchCost: cost });
      setSettings(prev => ({ ...prev, searchCost: cost }));
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
            <h2 className="text-3xl font-bold text-white">Administration</h2>
            <p className="text-slate-400">Manage user access and system economy.</p>
        </div>

        <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
            <span className="text-sm text-slate-400">Cost per Search:</span>
            <input
                type="number"
                value={settings.searchCost}
                onChange={(e) => handleUpdateCost(parseInt(e.target.value) || 0)}
                className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-center"
            />
            <span className="text-sm text-emerald-500 font-bold">CREDITS</span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-400">
          <thead className="bg-slate-950 text-slate-200 uppercase font-medium">
            <tr>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Credits</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4 font-medium text-white">{user.username}</td>
                <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${user.role === 'admin' ? 'bg-purple-900/50 text-purple-400 border border-purple-800' : 'bg-slate-800 text-slate-400'}`}>
                        {user.role}
                    </span>
                </td>
                <td className="px-6 py-4">
                    {user.isApproved ? (
                        <span className="flex items-center text-emerald-500">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span> Active
                        </span>
                    ) : (
                        <span className="flex items-center text-yellow-500">
                            <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span> Pending
                        </span>
                    )}
                </td>
                <td className="px-6 py-4">
                  {editingCredits === user.id ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white"
                            defaultValue={user.credits}
                            onChange={(e) => setCreditAmount(parseInt(e.target.value))}
                        />
                        <button onClick={() => handleUpdateCredits(user.id)} className="text-emerald-500 hover:text-emerald-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button onClick={() => setEditingCredits(null)} className="text-red-500 hover:text-red-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                        <span className="text-white font-mono">{user.credits}</span>
                        <button onClick={() => { setEditingCredits(user.id); setCreditAmount(user.credits); }} className="text-slate-500 hover:text-emerald-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                    {user.role !== 'admin' && (
                        <button
                            onClick={() => toggleApproval(user)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${user.isApproved ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40'}`}
                        >
                            {user.isApproved ? 'Revoke Access' : 'Approve Access'}
                        </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminPanel;
