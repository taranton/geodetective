import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import { SearchHistory } from '../types';

interface UserHistoryProps {
  userId: string;
}

const UserHistory: React.FC<UserHistoryProps> = ({ userId }) => {
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SearchHistory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiService.getUserHistory();
        setHistory(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadHistory();
  }, [userId]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this history item?')) return;

    setDeletingId(id);
    try {
      await apiService.deleteHistoryItem(id);
      setHistory(prev => prev.filter(item => item.id !== id));
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-slate-400">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
         <h2 className="text-2xl font-bold text-white">Mission History</h2>
         <span className="text-sm text-slate-500">{history.length} Records</span>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {history.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-900/30 rounded-2xl border border-slate-800 border-dashed">
            No analysis history found. Start your first investigation.
        </div>
      ) : (
        <div className="grid gap-4">
            {history.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-emerald-800 hover:bg-slate-900/80 transition-colors cursor-pointer"
                >
                    <div className="flex-1">
                        <h3 className="text-emerald-400 font-bold text-lg mb-1">{item.locationName}</h3>
                        <div className="flex items-center flex-wrap text-xs text-slate-500 gap-3">
                            <span>{new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString()}</span>
                            {item.coordinates && (
                                <span className="font-mono bg-slate-950 px-2 py-0.5 rounded text-slate-400">
                                    {item.coordinates.lat.toFixed(4)}, {item.coordinates.lng.toFixed(4)}
                                </span>
                            )}
                            {item.confidenceScore !== null && (
                                <span className={`px-2 py-0.5 rounded ${item.confidenceScore >= 70 ? 'bg-emerald-900/50 text-emerald-400' : item.confidenceScore >= 40 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-red-900/50 text-red-400'}`}>
                                    {item.confidenceScore}% confidence
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                         {item.coordinates && (
                             <a
                                href={`https://www.google.com/maps/search/?api=1&query=${item.coordinates.lat},${item.coordinates.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
                             >
                                View Map
                             </a>
                         )}
                         <button
                            onClick={(e) => handleDelete(e, item.id)}
                            disabled={deletingId === item.id}
                            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                         >
                            {deletingId === item.id ? '...' : 'Delete'}
                         </button>
                         <div className="text-right">
                             <span className="block text-xs text-slate-500">COST</span>
                             <span className="text-sm font-mono text-red-400">-{item.cost}</span>
                         </div>
                    </div>
                </div>
            ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-emerald-400">{selectedItem.locationName}</h2>
                <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
                  <span>{new Date(selectedItem.timestamp).toLocaleString()}</span>
                  {selectedItem.coordinates && (
                    <span className="font-mono bg-slate-950 px-2 py-0.5 rounded">
                      {selectedItem.coordinates.lat.toFixed(5)}, {selectedItem.coordinates.lng.toFixed(5)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Confidence Score */}
              {selectedItem.confidenceScore !== null && (
                <div className="flex items-center gap-4">
                  <span className="text-slate-400 text-sm">Confidence:</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all ${selectedItem.confidenceScore >= 70 ? 'bg-emerald-500' : selectedItem.confidenceScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${selectedItem.confidenceScore}%` }}
                    />
                  </div>
                  <span className="text-white font-bold">{selectedItem.confidenceScore}%</span>
                </div>
              )}

              {/* Visual Cues */}
              {selectedItem.visualCues && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Visual Intelligence</h3>
                  <div className="grid gap-3">
                    {selectedItem.visualCues.signs && (
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-xs text-emerald-500 font-mono block mb-1">SIGNS & TEXT</span>
                        <p className="text-sm text-slate-300">{selectedItem.visualCues.signs}</p>
                      </div>
                    )}
                    {selectedItem.visualCues.architecture && (
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-xs text-emerald-500 font-mono block mb-1">ARCHITECTURE</span>
                        <p className="text-sm text-slate-300">{selectedItem.visualCues.architecture}</p>
                      </div>
                    )}
                    {selectedItem.visualCues.environment && (
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-xs text-emerald-500 font-mono block mb-1">ENVIRONMENT</span>
                        <p className="text-sm text-slate-300">{selectedItem.visualCues.environment}</p>
                      </div>
                    )}
                    {selectedItem.visualCues.demographics && (
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <span className="text-xs text-emerald-500 font-mono block mb-1">DEMOGRAPHICS</span>
                        <p className="text-sm text-slate-300">{selectedItem.visualCues.demographics}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reasoning */}
              {selectedItem.reasoning && selectedItem.reasoning.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Deductive Reasoning</h3>
                  <ul className="space-y-3">
                    {selectedItem.reasoning.map((reason, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-900/30 text-emerald-500 flex items-center justify-center text-xs border border-emerald-900 mr-3 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-slate-300 leading-relaxed">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sources */}
              {selectedItem.sources && selectedItem.sources.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Grounding Sources</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.sources.map((source, i) => (
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

              {/* Map Link */}
              {selectedItem.coordinates && (
                <div className="pt-4 border-t border-slate-800">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedItem.coordinates.lat},${selectedItem.coordinates.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Open in Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserHistory;
