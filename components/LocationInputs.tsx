import React from 'react';
import { LocationHints } from '../types';

interface LocationInputsProps {
  hints: LocationHints;
  onChange: (key: keyof LocationHints, value: string) => void;
  disabled?: boolean;
}

const LocationInputs: React.FC<LocationInputsProps> = ({ hints, onChange, disabled }) => {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      <div className="flex items-center space-x-2 mb-2">
        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">Narrow Down Search (Optional)</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
            <label htmlFor="continent" className="text-xs text-slate-500 ml-1">Continent</label>
            <input
                id="continent"
                type="text"
                value={hints.continent}
                onChange={(e) => onChange('continent', e.target.value)}
                placeholder="e.g. Europe"
                disabled={disabled}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50"
            />
        </div>

        <div className="space-y-1">
            <label htmlFor="country" className="text-xs text-slate-500 ml-1">Country</label>
             <input
                id="country"
                type="text"
                value={hints.country}
                onChange={(e) => onChange('country', e.target.value)}
                placeholder="e.g. France"
                disabled={disabled}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50"
            />
        </div>

        <div className="space-y-1">
             <label htmlFor="city" className="text-xs text-slate-500 ml-1">City / Region</label>
             <input
                id="city"
                type="text"
                value={hints.city}
                onChange={(e) => onChange('city', e.target.value)}
                placeholder="e.g. Paris"
                disabled={disabled}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50"
            />
        </div>
      </div>

      {/* Additional Info Textarea */}
      <div className="space-y-1 mt-4">
        <label htmlFor="additionalInfo" className="text-xs text-slate-500 ml-1">Additional Context (time, date, event, other clues)</label>
        <textarea
          id="additionalInfo"
          value={hints.additionalInfo || ''}
          onChange={(e) => onChange('additionalInfo', e.target.value)}
          placeholder="e.g. Photo taken in summer 2023, during a music festival, near a train station..."
          disabled={disabled}
          rows={2}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50 resize-none"
        />
      </div>
    </div>
  );
};

export default LocationInputs;
