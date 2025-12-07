import React, { useState } from 'react';
import { GeoAnalysisResult } from '../types';
import ConfidenceChart from './ConfidenceChart';

interface AnalysisResultProps {
  result: GeoAnalysisResult;
  imagePreviews?: string[];
  onReset: () => void;
  onRefine: (feedback: string) => void;
  isRefining: boolean;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, imagePreviews, onReset, onRefine, isRefining }) => {
  const [refinementInput, setRefinementInput] = useState('');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

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

  const showCandidates = !result.isDefinitive && result.candidates && result.candidates.length > 1;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Multi-Candidate Banner (when uncertain) */}
      {showCandidates && (
        <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-800/50 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-900/50 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-amber-300 mb-2">Multiple Possible Locations Detected</h3>
              <p className="text-sm text-amber-200/80 mb-4">
                The image lacks distinctive markers for a definitive identification. Here are the most likely candidates based on visual analysis:
              </p>

              {/* Candidates Grid */}
              <div className="grid gap-3">
                {result.candidates!.map((candidate, idx) => (
                  <div
                    key={idx}
                    className={`relative overflow-hidden rounded-xl p-4 transition-all ${
                      idx === 0
                        ? 'bg-emerald-900/40 border-2 border-emerald-600/50'
                        : 'bg-slate-900/60 border border-slate-700/50'
                    }`}
                  >
                    {/* Probability Bar Background */}
                    <div
                      className={`absolute inset-0 ${idx === 0 ? 'bg-emerald-500/10' : 'bg-slate-500/10'}`}
                      style={{ width: `${candidate.probability}%` }}
                    />

                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className={`font-semibold ${idx === 0 ? 'text-emerald-300' : 'text-slate-200'}`}>
                            {candidate.locationName}
                          </h4>
                          {candidate.keyEvidence && candidate.keyEvidence.length > 0 && (
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                              {candidate.keyEvidence[0]}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${
                          idx === 0 ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {candidate.probability}%
                        </span>
                        <p className="text-xs text-slate-500">probability</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
        <div>
            {showCandidates ? (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded border border-amber-800">
                  TOP CANDIDATE
                </span>
              </div>
            ) : result.isDefinitive && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800">
                  HIGH CONFIDENCE
                </span>
              </div>
            )}
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
            {/* Analyzed Images */}
            {imagePreviews && imagePreviews.length > 0 && (
              <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Analyzed Image{imagePreviews.length > 1 ? 's' : ''}</h3>
                <div className="relative">
                  <img
                    src={imagePreviews[selectedImageIndex]}
                    alt={`Evidence ${selectedImageIndex + 1}`}
                    className="w-full aspect-video object-cover rounded-lg border border-slate-700"
                  />
                  {imagePreviews.length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-white">
                      {selectedImageIndex + 1} / {imagePreviews.length}
                    </div>
                  )}
                </div>
                {imagePreviews.length > 1 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                    {imagePreviews.map((preview, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`flex-shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 transition-all ${
                          idx === selectedImageIndex
                            ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                            : 'border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <img src={preview} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Probability Matrix</h3>
                <ConfidenceChart score={result.confidenceScore} />

                {/* Dual Confidence Breakdown */}
                {result.confidence && (
                  <div className="mt-6 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Region certainty</span>
                        <span className="text-emerald-400">{result.confidence.region}%</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${result.confidence.region}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Pinpoint certainty</span>
                        <span className="text-blue-400">{result.confidence.local}%</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${result.confidence.local}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

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

            {/* Evidence Breakdown */}
            {result.evidence && result.evidence.length > 0 && (
              <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Evidence Analysis</h3>
                <div className="space-y-2">
                  {result.evidence.map((item, idx) => {
                    const strength = item.strength || 'soft';
                    return (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-mono rounded ${
                          strength === 'hard' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800' :
                          strength === 'medium' ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800' :
                          'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {strength.toUpperCase()}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm text-slate-300">{item.clue || 'Unknown clue'}</p>
                          <p className="text-xs text-slate-500 mt-1">→ {item.supports || 'Unknown'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Alternative Locations & Uncertainties */}
            {((result.alternativeLocations && result.alternativeLocations.length > 0) ||
              (result.uncertainties && result.uncertainties.length > 0)) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.alternativeLocations && result.alternativeLocations.length > 0 && (
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-3">Alternative Locations</h3>
                    <ul className="space-y-1">
                      {result.alternativeLocations.map((loc, idx) => (
                        <li key={idx} className="text-sm text-slate-400 flex items-center gap-2">
                          <span className="text-amber-600">?</span> {loc}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.uncertainties && result.uncertainties.length > 0 && (
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3">Uncertainties</h3>
                    <ul className="space-y-1">
                      {result.uncertainties.map((unc, idx) => (
                        <li key={idx} className="text-sm text-slate-400 flex items-center gap-2">
                          <span className="text-red-600">!</span> {unc}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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