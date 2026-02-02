
import React, { useState } from 'react';
import { Video, Sparkles, Play, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { generateSafetyReel } from '../services/geminiService';

export const SafetyReels: React.FC = () => {
  const [prompt, setPrompt] = useState('active shops and street lights');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);

  const phases = [
    "Analyzing lighting data...",
    "Scanning crowd density...",
    "Verifying open storefronts...",
    "Generating safety simulation...",
    "Finalizing high-res video..."
  ];

  const handleGenerate = async () => {
    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
    }
    
    setLoading(true);
    setVideoUrl(null);
    const interval = setInterval(() => {
      setLoadingPhase(p => (p + 1) % phases.length);
    }, 4000);

    try {
      const url = await generateSafetyReel(prompt);
      setVideoUrl(url);
    } catch (e) {
      console.error(e);
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-10 h-full overflow-y-auto bg-white">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-lavender-deep rounded-[3rem] p-10 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Video size={140} />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black mb-3 tracking-tight">Safety Reels</h2>
            <p className="opacity-80 text-sm mb-6 max-w-xl">
              Simulate your travel environment using AI. Visualize street conditions before you even step out.
            </p>
            <div className="bg-white/10 p-1 rounded-2xl flex gap-2 w-fit">
              <button 
                onClick={() => setPrompt('bright street lights and patrolling police')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${prompt.includes('police') ? 'bg-white text-lavender-deep' : 'hover:bg-white/20'}`}
              >
                Safe Path
              </button>
              <button 
                onClick={() => setPrompt('busy market with many women present')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${prompt.includes('market') ? 'bg-white text-lavender-deep' : 'hover:bg-white/20'}`}
              >
                Crowded Market
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white border-2 border-soft-lavender rounded-[2.5rem] p-8 space-y-6 shadow-sm">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="text-calm-teal" size={20} /> Scenario Simulation
            </h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-32 bg-soft-lavender/20 border-2 border-soft-lavender rounded-2xl p-4 text-sm focus:ring-2 focus:ring-lavender-deep outline-none"
              placeholder="Describe the environment you want to visualize..."
            />
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-5 bg-calm-teal text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-lg hover:bg-calm-teal-deep transition-all"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <><Play size={18} /> Generate Simulation</>}
            </button>
            <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-widest">
              Powered by Veo 3.1 • Takes approx 60s
            </p>
          </div>

          <div className="aspect-video bg-soft-lavender rounded-[2.5rem] border-2 border-dashed border-lavender-medium flex items-center justify-center overflow-hidden relative shadow-inner">
            {loading ? (
              <div className="text-center space-y-4 px-6 animate-pulse">
                <Loader2 size={48} className="animate-spin text-lavender-deep mx-auto" />
                <p className="text-lavender-deep font-black uppercase tracking-widest text-xs">{phases[loadingPhase]}</p>
                <p className="text-slate-400 text-[10px] font-medium italic">Veo is imagining your safe corridor...</p>
              </div>
            ) : videoUrl ? (
              <video 
                src={videoUrl} 
                controls 
                autoPlay 
                loop 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center space-y-2 opacity-40">
                <Video size={48} className="mx-auto" />
                <p className="font-bold text-xs">Ready for Simulation</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
