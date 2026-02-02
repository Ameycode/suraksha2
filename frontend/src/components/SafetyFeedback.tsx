
import React, { useState, useEffect, useRef } from 'react';
import { Lightbulb, Users, Store, MapPin, Send, Zap, CheckCircle2, Loader2, Info, Map as MapIcon, Edit3, Search, Star, Sparkles, Navigation, AlignLeft } from 'lucide-react';
import { auth, db, ref, push, set, get } from '../services/firebase';
import { GoogleGenAI } from "@google/genai";

interface SafetyFeedbackProps {
  userLocation: { lat: number; lng: number };
}

export const SafetyFeedback: React.FC<SafetyFeedbackProps> = ({ userLocation }) => {
  const [lighting, setLighting] = useState('moderate');
  const [crowd, setCrowd] = useState('moderate');
  const [shops, setShops] = useState('open');
  const [description, setDescription] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [isManual, setIsManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [userName, setUserName] = useState('Member');
  
  useEffect(() => {
    const fetchProfile = async () => {
      if (auth.currentUser) {
        const userRef = ref(db, `users/${auth.currentUser.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setUserName(snapshot.val().name || 'Member');
        }
      }
    };
    fetchProfile();
  }, []);

  const calculatePSI = (l: string, c: string, s: string) => {
    const lightingMap: Record<string, number> = { poor: 0, moderate: 40, sufficient: 80, visible: 100 };
    const crowdMap: Record<string, number> = { low: 20, moderate: 50, sufficient: 85, busy: 100 };
    const shopsMap: Record<string, number> = { close: 0, open: 70, open_night: 100 };
    const score = (lightingMap[l] + crowdMap[c] + shopsMap[s]) / 3;
    return Math.round(score);
  };

  const getAIAdvice = async () => {
    setAdviceLoading(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    try {
      const locationContext = isManual && manualLocation ? `at ${manualLocation}` : "in my current area";
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `CRITICAL SAFETY ADVICE: Location: ${locationContext}. Lighting: ${lighting}, Crowd: ${crowd}, Shops: ${shops}. User Description: ${description}. Focus on immediate action. Max 30 words.`,
      });
      setAdvice(response.text || "Prioritize moving towards well-lit public hubs.");
    } catch (e) {
      setAdvice("Stay in sight of active shops and share your track.");
    } finally {
      setAdviceLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const reportsRef = ref(db, 'safety_reports');
      const newReportRef = push(reportsRef);
      const currentPSI = calculatePSI(lighting, crowd, shops);

      await set(newReportRef, {
        userId: auth.currentUser?.uid,
        authorName: userName,
        timestamp: new Date().toISOString(),
        coordinates: isManual ? null : userLocation,
        manualPlaceName: isManual ? manualLocation : null,
        lighting,
        crowd,
        shops,
        description,
        psi: currentPSI,
        isVerified: true
      });
      
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setDescription('');
      }, 3000);
    } catch (error) {
      console.error("Error submitting feedback:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-10 h-full overflow-y-auto bg-white no-scrollbar">
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-800 tracking-tighter">Community Feedback</h2>
            <p className="text-slate-500 text-sm font-medium">Hello <span className="text-lavender-deep font-bold">{userName}</span>, your observations save lives.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form onSubmit={handleSubmit} className="lg:col-span-7 bg-white rounded-[2.5rem] border border-lavender-medium p-8 space-y-8 shadow-sm">
            <div className="space-y-6">
              <label className="text-[10px] font-black text-slate-500 flex items-center gap-2 uppercase tracking-[0.2em]">
                <MapPin size={16} className="text-lavender-deep" /> Location Context
              </label>
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border-2 transition-all ${!isManual ? 'bg-soft-lavender/30 border-lavender-medium' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">Live GPS Coordinates</span>
                    {!isManual && <div className="w-2 h-2 rounded-full bg-calm-teal animate-pulse"></div>}
                  </div>
                  <p className="text-[10px] font-mono text-slate-400">
                    LAT: {userLocation.lat.toFixed(6)} | LNG: {userLocation.lng.toFixed(6)}
                  </p>
                </div>
                <div className="flex items-center gap-3 px-1">
                  <input type="checkbox" id="manualToggle" checked={isManual} onChange={() => setIsManual(!isManual)} className="w-4 h-4 accent-lavender-deep rounded" />
                  <label htmlFor="manualToggle" className="text-xs font-bold text-slate-500 cursor-pointer">Provide Manual Location instead</label>
                </div>
                {isManual && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <input type="text" placeholder="e.g. Near Star Bazaar, Sector 12..." value={manualLocation} onChange={(e) => setManualLocation(e.target.value)} className="w-full bg-white border-2 border-lavender-medium rounded-xl p-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none shadow-sm" required={isManual} />
                  </div>
                )}
              </div>
            </div>
            
            <hr className="border-lavender-medium/30" />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 flex items-center gap-2 uppercase tracking-[0.2em]">
                  <Lightbulb size={16} className="text-calm-teal" /> Lighting Condition
                </label>
                <select value={lighting} onChange={(e) => setLighting(e.target.value)} className="w-full bg-white border-2 border-lavender-medium rounded-xl p-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-calm-teal outline-none appearance-none shadow-sm cursor-pointer">
                  <option value="poor">Poor (Dark Patches)</option>
                  <option value="moderate">Moderate (Some Lights)</option>
                  <option value="sufficient">Sufficient (Standard)</option>
                  <option value="visible">Visible (High Beam/LEDs)</option>
                </select>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 flex items-center gap-2 uppercase tracking-[0.2em]">
                  <Users size={16} className="text-calm-teal" /> Crowd Density
                </label>
                <select value={crowd} onChange={(e) => setCrowd(e.target.value)} className="w-full bg-white border-2 border-lavender-medium rounded-xl p-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-calm-teal outline-none appearance-none shadow-sm cursor-pointer">
                  <option value="low">Low (Deserted)</option>
                  <option value="moderate">Moderate (Few People)</option>
                  <option value="sufficient">Sufficient (Active Area)</option>
                  <option value="busy">Busy (Thriving Hub)</option>
                </select>
              </div>
              <div className="space-y-4 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 flex items-center gap-2 uppercase tracking-[0.2em]">
                  <Store size={16} className="text-calm-teal" /> Active Stores
                </label>
                <select value={shops} onChange={(e) => setShops(e.target.value)} className="w-full bg-white border-2 border-lavender-medium rounded-xl p-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-calm-teal outline-none appearance-none shadow-sm cursor-pointer">
                  <option value="close">All Closed</option>
                  <option value="open">Standard Shops Open</option>
                  <option value="open_night">Night Establishments Active (24/7)</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 flex items-center gap-2 uppercase tracking-[0.2em]">
                <AlignLeft size={16} className="text-calm-teal" /> Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe safety factors (e.g. 'Street lights are broken', 'Police patrol visible')..."
                className="w-full bg-white border-2 border-lavender-medium rounded-xl p-4 text-sm focus:ring-2 focus:ring-calm-teal outline-none shadow-sm h-32 resize-none"
              />
            </div>

            <button type="submit" disabled={loading} className="w-full py-5 rounded-2xl font-black uppercase tracking-widest text-xs bg-lavender-deep text-white hover:bg-lavender-medium transition-all shadow-xl active:scale-95 disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : submitted ? 'Success: Feedback Synchronized' : 'Sync Community Feedback'}
            </button>
          </form>
          <div className="lg:col-span-5 space-y-6">
             <div className="bg-gradient-to-br from-lavender-deep to-lavender-medium rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden group">
               <div className="absolute -top-10 -right-10 text-white/5 group-hover:rotate-12 transition-transform duration-700">
                  <Zap size={200} />
               </div>
               <h3 className="text-xl font-black mb-4 flex items-center gap-2 tracking-tighter"><Zap className="fill-current" /> Safety Engine</h3>
               <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 mb-6 text-sm italic font-medium border border-white/20">
                 {advice || "Provide feedback to calculate the real-time Positive Safety Index (PSI) and receive movement guidance."}
               </div>
               <button onClick={getAIAdvice} className="w-full py-4 bg-white text-lavender-deep rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg hover:bg-soft-lavender transition-all" disabled={adviceLoading}>
                 {adviceLoading ? <Loader2 className="animate-spin mx-auto" size={16} /> : "Query Safety AI"}
               </button>
             </div>
             <div className="bg-soft-lavender/30 rounded-[2.5rem] p-8 border border-lavender-medium flex items-start gap-4">
                <div className="bg-white p-2 rounded-xl text-lavender-deep shadow-sm"><Info size={20} /></div>
                <div className="space-y-1">
                   <h4 className="font-bold text-slate-800 text-sm">Real-time Safety Index</h4>
                   <p className="text-xs text-slate-500 leading-relaxed">Your entries directly update the <b>Positive Safety Index (PSI)</b>. High PSI areas (80+) are prioritized in the path-finding algorithm.</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
