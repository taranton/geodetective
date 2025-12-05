import React, { useState } from 'react';
import { GeoAnalysisResult } from '../types';
import ConfidenceChart from './ConfidenceChart';

interface AnalysisResultProps {
  result: GeoAnalysisResult;
  onReset: () => void;
  onRefine: (feedback: string) => void;
  isRefining: boolean;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, onReset, onRefine, isRefining }) => {
  const [refinementInput, setRefinementInput] = useState('');

  const fallbackMapLink = result.coordinates 
      ? `https://www.google.com/maps/search/?api=1&query=${result.coordinates.lat},${result.coordinates.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.locationName)}`;

  const handleRefineClick = () => {
      if (!refinementInput.trim()) {
          onRefine("Double-check this result. Verify the location using additional visual markers and search for any contradictions.");
      } else {
          onRefine(refinementInput);
      }
      setRefinementInput('');
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
        <div>
            <h2 className="text-3xl font-bold text-emerald-400 mb-2">{result.locationName}</h2>
            <div className="flex items-center space-x-2 text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{result.coordinates ? `${result.coordinates.lat.toFixed(5)}, ${result.coordinates.lng.toFixed(5)}` : 'Approximate Region'}</span>
            </div>
        </div>
        <button
          onClick={onReset}
          className="px-6 py-2 rounded-full border border-slate-700 hover:bg-slate-800 transition-colors text-sm font-medium text-slate-300"
        >
          Analyze New Image
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Visual Data & Stats */}
        <div className="space-y-6">
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Probability Matrix</h3>
                <ConfidenceChart score={result.confidenceScore} />
                <div className="mt-6 space-y-2 text-center">
                    <p className="text-sm text-slate-500">Based on cross-referencing {result.sources.length} sources and visual features.</p>
                </div>
            </div>

            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Visual Intelligence</h3>
                <div className="space-y-4">
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-xs text-emerald-500 font-mono block mb-1">SIGNS & TEXT</span>
                        <p className="text-sm text-slate-300">{result.visualCues.signs || "No distinct text detected."}</p>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-xs text-emerald-500 font-mono block mb-1">ARCHITECTURE</span>
                        <p className="text-sm text-slate-300">{result.visualCues.architecture || "No distinctive architecture."}</p>
                    </div>
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-xs text-emerald-500 font-mono block mb-1">ENVIRONMENT</span>
                        <p className="text-sm text-slate-300">{result.visualCues.environment || "Generic environment."}</p>
                    </div>
                    {result.visualCues.demographics && (
                         <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                         <span className="text-xs text-emerald-500 font-mono block mb-1">DEMOGRAPHICS</span>
                         <p className="text-sm text-slate-300">{result.visualCues.demographics}</p>
                     </div>
                    )}
                </div>
            </div>
        </div>

        {/* Middle/Right: Reasoning & Map */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                 <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Deductive Reasoning</h3>
                 <ul className="space-y-3">
                    {result.reasoning.map((reason, idx) => (
                        <li key={idx} className="flex items-start">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-900/30 text-emerald-500 flex items-center justify-center text-xs border border-emerald-900 mr-3 mt-0.5">{idx + 1}</span>
                            <span className="text-slate-300 leading-relaxed">{reason}</span>
                        </li>
                    ))}
                 </ul>
            </div>

            <div className="bg-slate-900 rounded-2xl p-1 border border-slate-800 shadow-xl overflow-hidden h-96 relative group">
                 <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                     <a href={fallbackMapLink} target="_blank" rel="noopener noreferrer" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition-transform transform hover:scale-105">
                         Open in Google Maps
                     </a>
                 </div>
                 {result.coordinates ? (
                    <iframe
                        width="100%"
                        height="100%"
                        style={{ border: 0, filter: 'grayscale(30%) invert(90%) hue-rotate(180deg) contrast(1.2)' }}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.google.com/maps?q=${result.coordinates.lat},${result.coordinates.lng}&z=14&output=embed`}
                    ></iframe>
                 ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-600">
                        <p>Coordinates not precise enough for embedded map preview.</p>
                    </div>
                 )}
            </div>
            
            {result.sources.length > 0 && (
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Grounding Sources</h3>
                    <div className="flex flex-wrap gap-2">
                        {result.sources.map((source, i) => (
                            <a 
                                key={i} 
                                href={source.uri} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-xs bg-slate-950 hover:bg-slate-800 border border-slate-700 text-emerald-500 px-3 py-1 rounded-full transition-colors truncate max-w-xs"
                            >
                                {source.title}
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Investigation Console */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl animate-fade-in-up">
                <div className="flex items-center space-x-2 mb-4">
                     <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                     </svg>
                    <h3 className="text-lg font-bold text-white">Investigation Console</h3>
                </div>
                
                <p className="text-sm text-slate-400 mb-4">
                    Not satisfied with the result? Provide additional clues or ask the AI to double-check specific features.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                    <input 
                        type="text" 
                        value={refinementInput}
                        onChange={(e) => setRefinementInput(e.target.value)}
                        placeholder="e.g. 'I see a sign that ends in .pl', 'Check the license plates again', 'Is this Italy?'"
                        disabled={isRefining}
                        className="flex-grow bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                        onKeyDown={(e) => e.key === 'Enter' && handleRefineClick()}
                    />
                    <button 
                        onClick={handleRefineClick}
                        disabled={isRefining}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium px-6 py-3 rounded-lg transition-all flex items-center justify-center min-w-[140px]"
                    >
                        {isRefining ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Refining...
                            </>
                        ) : (
                            'Verify & Refine'
                        )}
                    </button>
                </div>
                <div className="mt-3 flex gap-2">
                    <button onClick={() => onRefine("Analyze the angle of shadows and sun position to verify if it matches the latitude.")} disabled={isRefining} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full transition-colors">
                        Check Shadows
                    </button>
                    <button onClick={() => onRefine("Analyze utility poles, road markings, and infrastructure for country-specific identifiers.")} disabled={isRefining} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full transition-colors">
                        Check Infrastructure
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisResult;