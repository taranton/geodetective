import React, { useState, useRef, useEffect } from 'react';
import ImageUploader from './components/ImageUploader';
import AnalysisResult from './components/AnalysisResult';
import LocationInputs from './components/LocationInputs';
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import UserHistory from './components/UserHistory';
import UserSettings from './components/UserSettings';
import { apiService } from './services/apiService';
import { AnalysisState, LocationHints, User, SystemSettings } from './types';

const LOADING_STAGES = [
  "Initializing Computer Vision...",
  "Extracting Optical Characters (OCR)...",
  "Analyzing Architectural Patterns...",
  "Fingerprinting Infrastructure...",
  "Calculating Solar Azimuth...",
  "Cross-referencing Satellite Imagery...",
  "Verifying Biogeographic Markers...",
  "Triangulating Coordinates..."
];

type ViewState = 'home' | 'history' | 'admin';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const [locationHints, setLocationHints] = useState<LocationHints>({
    continent: '',
    country: '',
    city: ''
  });
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [settings, setSettings] = useState<SystemSettings>({ searchCost: 10 });
  const [isInitializing, setIsInitializing] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const imageDataRef = useRef<Array<{ base64: string, mimeType: string }>>([]);

  // Check for existing session on mount
  useEffect(() => {
    const initApp = async () => {
      try {
        const [currentUser, systemSettings] = await Promise.all([
          apiService.getCurrentUser(),
          apiService.getSystemSettings()
        ]);
        if (currentUser) setUser(currentUser);
        setSettings(systemSettings);
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        setIsInitializing(false);
      }
    };
    initApp();
  }, []);

  // Refresh user data
  const refreshUser = async () => {
    try {
      const u = await apiService.getCurrentUser();
      if (u) setUser(u);
    } catch (err) {
      console.error('Refresh user error:', err);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state.status === 'analyzing') {
      setLoadingStageIndex(0);
      interval = setInterval(() => {
        setLoadingStageIndex((prev) => (prev + 1) % LOADING_STAGES.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [state.status]);

  // Store uploaded images without auto-starting analysis
  const handleImagesSelected = (images: Array<{ base64: string, mimeType: string, previewUrl: string }>) => {
    if (!user) return;

    const previews = images.map(img => img.previewUrl);
    imageDataRef.current = images.map(img => ({ base64: img.base64, mimeType: img.mimeType }));

    // Set to 'ready' state - show preview but don't analyze yet
    setState({ status: 'ready', imagePreviews: previews });
  };

  // Start analysis when user clicks the button
  const handleStartAnalysis = async () => {
    if (!user || imageDataRef.current.length === 0) return;

    // Check credits on client side first
    if (user.credits < settings.searchCost) {
      alert(`Insufficient credits. Required: ${settings.searchCost}, Available: ${user.credits}. Contact an administrator.`);
      return;
    }

    const previews = state.imagePreviews || [];
    setState({ status: 'analyzing', imagePreviews: previews });

    try {
      // Call API for analysis (handles credits deduction on server)
      const { result, creditsRemaining, cost } = await apiService.analyzeImages(
        imageDataRef.current,
        locationHints
      );

      // Save to history
      await apiService.addHistory(result, cost);

      // Update user credits
      setUser(prev => prev ? { ...prev, credits: creditsRemaining } : null);

      setState({ status: 'complete', result, imagePreviews: previews });
    } catch (error: any) {
      console.error(error);
      setState({
        status: 'error',
        error: error.message || "We couldn't determine the location. The images might lack distinct features or the service is temporarily unavailable.",
        imagePreviews: previews
      });
    }
  };

  const handleRefine = async (feedback: string) => {
    if (!state.result || imageDataRef.current.length === 0) return;

    const currentResult = state.result;
    setState(prev => ({ ...prev, isRefining: true }));

    try {
      const refinedResult = await apiService.refineAnalysis(
        imageDataRef.current,
        currentResult,
        feedback,
        locationHints
      );
      setState(prev => ({
        ...prev,
        status: 'complete',
        result: refinedResult,
        isRefining: false
      }));
    } catch (error) {
      console.error("Refinement failed", error);
      setState(prev => ({ ...prev, isRefining: false }));
      alert("Refinement failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    await apiService.logout();
    setUser(null);
    setState({ status: 'idle' });
    setCurrentView('home');
  };

  // Show loading screen while initializing
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400">Initializing...</p>
      </div>
    );
  }

  // --- Render Auth Screen if not logged in ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col">
        <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md p-4 flex justify-center">
            <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <span className="text-lg font-bold tracking-tight text-white">GeoDetective <span className="text-emerald-500">AI</span></span>
            </div>
        </nav>
        <Auth onLogin={setUser} />
      </div>
    );
  }

  // --- Main Application ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentView('home')}>
            <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-white hidden sm:block">GeoDetective <span className="text-emerald-500">AI</span></span>
          </div>

          <div className="flex items-center space-x-4">
             {/* Credit Balance */}
             <div className="hidden sm:flex items-center bg-slate-900 rounded-full px-4 py-1.5 border border-slate-800">
                <span className="text-xs text-slate-400 mr-2">CREDITS</span>
                <span className={`font-mono font-bold ${user.credits < 10 ? 'text-red-500' : 'text-emerald-400'}`}>
                    {user.credits}
                </span>
             </div>

             {/* Navigation Links */}
             <div className="flex items-center space-x-1 sm:space-x-4">
                <button
                    onClick={() => setCurrentView('home')}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentView === 'home' ? 'bg-emerald-900/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                >
                    Search
                </button>
                <button
                    onClick={() => { refreshUser(); setCurrentView('history'); }}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentView === 'history' ? 'bg-emerald-900/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                >
                    History
                </button>
                {user.role === 'admin' && (
                    <button
                        onClick={() => setCurrentView('admin')}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentView === 'admin' ? 'bg-emerald-900/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                    >
                        Admin
                    </button>
                )}
             </div>

             <div className="h-6 w-px bg-slate-800 mx-2"></div>

             <div className="flex items-center gap-2">
                 <span className="text-sm text-slate-300 hidden md:block">{user.username}</span>
                 <button
                   onClick={() => setShowSettings(true)}
                   className="text-slate-500 hover:text-emerald-400 transition-colors p-1"
                   title="Settings"
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                 </button>
                 <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors p-1" title="Logout">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                 </button>
             </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col items-center justify-center p-4 sm:p-8">

        {/* VIEW: ADMIN */}
        {currentView === 'admin' && user.role === 'admin' && (
            <AdminPanel />
        )}

        {/* VIEW: HISTORY */}
        {currentView === 'history' && (
            <UserHistory userId={user.id} />
        )}

        {/* VIEW: HOME (Search) */}
        {currentView === 'home' && (
            <>
                {state.status === 'idle' && (
                <div className="w-full max-w-4xl space-y-8 text-center animate-fade-in-up">
                    <div className="space-y-4 mb-8">
                    <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white">
                        Locate any <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">photograph</span>.
                    </h1>
                    <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                        Upload one or more images to analyze architectural patterns, signs, and environment.
                    </p>
                    <div className="inline-flex items-center bg-slate-900 border border-slate-800 rounded-full px-4 py-1 text-xs font-mono text-slate-400">
                        SEARCH COST: <span className="text-emerald-400 ml-1 font-bold">{settings.searchCost} CREDITS</span>
                    </div>
                    </div>

                    <div className="space-y-6">
                        <ImageUploader onImagesSelected={handleImagesSelected} />
                    </div>
                </div>
                )}

                {state.status === 'ready' && (
                <div className="w-full max-w-4xl space-y-6 animate-fade-in">
                    {/* Image Preview */}
                    <div className={`relative w-full max-w-3xl mx-auto rounded-2xl overflow-hidden border border-slate-700 bg-black grid ${state.imagePreviews && state.imagePreviews.length > 1 ? 'grid-cols-2 gap-0.5' : 'grid-cols-1'}`}>
                        {state.imagePreviews && state.imagePreviews.map((preview, idx) => (
                            <div key={idx} className={`relative overflow-hidden ${state.imagePreviews && state.imagePreviews.length > 2 && idx === 0 ? 'col-span-2 aspect-video' : 'aspect-video'}`}>
                                <img
                                    src={preview}
                                    alt={`Evidence ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ))}
                        {/* Image count badge */}
                        <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-white font-mono">
                            {state.imagePreviews?.length || 0} IMAGE{(state.imagePreviews?.length || 0) !== 1 ? 'S' : ''} LOADED
                        </div>
                    </div>

                    {/* Hints Form */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                        <LocationInputs
                            hints={locationHints}
                            onChange={(key, val) => setLocationHints(prev => ({ ...prev, [key]: val }))}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={() => { setState({ status: 'idle' }); imageDataRef.current = []; }}
                            className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleStartAnalysis}
                            disabled={user && user.credits < settings.searchCost}
                            className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            Start Analysis
                            <span className="text-xs font-mono opacity-80">(-{settings.searchCost})</span>
                        </button>
                    </div>
                </div>
                )}

                {state.status === 'analyzing' && (
                <div className="w-full max-w-4xl flex flex-col items-center animate-fade-in">
                    <div className={`relative w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl border border-slate-700 mb-8 bg-black grid ${state.imagePreviews && state.imagePreviews.length > 1 ? 'grid-cols-2 gap-0.5' : 'grid-cols-1'}`}>
                        {state.imagePreviews && state.imagePreviews.map((preview, idx) => (
                            <div key={idx} className={`relative overflow-hidden ${state.imagePreviews && state.imagePreviews.length > 2 && idx === 0 ? 'col-span-2 aspect-video' : 'aspect-video'}`}>
                                <img
                                    src={preview}
                                    alt={`Evidence ${idx + 1}`}
                                    className="w-full h-full object-cover opacity-60"
                                />
                            </div>
                        ))}

                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent w-full h-1/4 animate-scan z-10 border-b-2 border-emerald-500/50 pointer-events-none"></div>

                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                            <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4 bg-black/50 backdrop-blur-sm"></div>
                            <p className="text-emerald-400 font-mono text-sm tracking-widest animate-pulse bg-black/50 px-3 py-1 rounded">
                            ANALYZING {state.imagePreviews?.length} SOURCES
                            </p>
                        </div>
                    </div>
                    <p className="text-slate-300 font-mono text-center max-w-md animate-pulse">
                        &gt; {LOADING_STAGES[loadingStageIndex]}
                    </p>
                </div>
                )}

                {state.status === 'complete' && state.result && (
                <AnalysisResult
                    result={state.result}
                    imagePreviews={state.imagePreviews}
                    onReset={() => setState({ status: 'idle' })}
                    onRefine={handleRefine}
                    isRefining={!!state.isRefining}
                />
                )}

                {state.status === 'error' && (
                <div className="text-center space-y-6 max-w-lg">
                    <div className="w-20 h-20 rounded-full bg-red-900/20 flex items-center justify-center mx-auto text-red-500">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h3 className="text-2xl font-bold text-white">Analysis Failed</h3>
                    <p className="text-slate-400">{state.error}</p>
                    <button
                    onClick={() => setState({ status: 'idle' })}
                    className="px-8 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                    >
                    Try Again
                    </button>
                </div>
                )}
            </>
        )}

      </main>

       <footer className="w-full border-t border-slate-900 py-6 text-center text-slate-600 text-sm">
        <p>&copy; {new Date().getFullYear()} GeoDetective AI. All rights reserved.</p>
      </footer>

      {/* User Settings Modal */}
      <UserSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
};

export default App;
