import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

interface PremiumService {
  key: string;
  name: string;
  description: string;
  cost: number;
  enabled: boolean;
}

interface UserSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: () => void;
}

const UserSettings: React.FC<UserSettingsProps> = ({ isOpen, onClose, onSettingsChange }) => {
  const [services, setServices] = useState<PremiumService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getUserSettings();
      setServices(data.premiumServices || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (serviceKey: string) => {
    const service = services.find(s => s.key === serviceKey);
    if (!service) return;

    setSaving(true);
    try {
      const newValue = !service.enabled;
      const updated = await apiService.updateUserSettings({
        premiumServices: { [serviceKey]: newValue }
      });
      setServices(updated.premiumServices || []);
      onSettingsChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Settings</h2>
              <p className="text-xs text-slate-500">Configure analysis options</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={loadSettings}
                className="text-sm text-emerald-400 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Premium Services Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Premium Services</span>
                  <span className="text-xs text-slate-600">(additional credits per search)</span>
                </div>

                <div className="space-y-3">
                  {services.length === 0 ? (
                    <p className="text-slate-500 text-sm">No premium services available</p>
                  ) : (
                    services.map((service) => (
                      <div
                        key={service.key}
                        className={`p-4 rounded-xl border transition-colors ${
                          service.enabled
                            ? 'bg-emerald-900/20 border-emerald-800'
                            : 'bg-slate-800/50 border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-white">{service.name}</h3>
                              <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full border border-amber-800">
                                +{service.cost} credits
                              </span>
                            </div>
                            <p className="text-sm text-slate-400">{service.description}</p>
                          </div>

                          {/* Toggle Switch */}
                          <button
                            onClick={() => handleToggle(service.key)}
                            disabled={saving}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              service.enabled ? 'bg-emerald-600' : 'bg-slate-600'
                            } ${saving ? 'opacity-50' : ''}`}
                          >
                            <div
                              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                service.enabled ? 'translate-x-7' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-slate-400">
                    <p className="mb-1">Premium services use additional credits per analysis.</p>
                    <p>Enable them to improve location detection accuracy.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserSettings;
