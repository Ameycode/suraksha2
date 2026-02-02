
import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, CheckCircle, AlertTriangle, X, Shield, CameraOff, Lightbulb, Users, Store, Send, MapPin, Edit3, Sparkles } from 'lucide-react';
import { analyzeSafetyImage } from '../services/geminiService';
import { GeminiAnalysisResult } from '../types';
import { auth, db, ref, push, set } from '../services/firebase';

interface SafetyScannerProps {
  onClose: () => void;
  userLocation: { lat: number; lng: number };
}

export const SafetyScanner: React.FC<SafetyScannerProps> = ({ onClose, userLocation }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<GeminiAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [editedLighting, setEditedLighting] = useState<string>('moderate');
  const [editedCrowd, setEditedCrowd] = useState<string>('moderate');
  const [editedShops, setEditedShops] = useState<string>('open');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError("Camera permission is required for real-time safety scanning.");
      }
    }
    if (!image) setupCamera();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [image]);

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg');
        setImage(base64);
        stream?.getTracks().forEach(t => t.stop());
        setStream(null);
        handleAnalysis(base64.split(',')[1]);
      }
    }
  };

  const handleAnalysis = async (base64Data: string) => {
    setAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeSafetyImage(base64Data);
      setResult(data);
      setEditedLighting(data.lighting);
      setEditedCrowd(data.crowd);
      setEditedShops(data.shops);
    } catch (e) {
      setError("AI analysis failed. Please try a clearer shot.");
    } finally {
      setAnalyzing(false);
    }
  };

  const submitReport = async () => {
    if (!result) return;
    setSubmitting(true);
    try {
      const reportsRef = ref(db, 'safety_reports');
      const newReportRef = push(reportsRef);
      await set(newReportRef, {
        userId: auth.currentUser?.uid,
        timestamp: new Date().toISOString(),
        coordinates: userLocation,
        lighting: editedLighting,
        crowd: editedCrowd,
        shops: editedShops,
        psi: result.psiScore,
        source: 'AI_SCAN_VERIFIED'
      });
      setSubmitted(true);
      setTimeout(onClose, 2000);
    } catch (e) {
      setError("Failed to sync report with community map.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2500] bg-white flex flex-col animate-in fade-in duration-300 overflow-hidden">
      <div className="px-6 py-5 flex justify-between items-center bg-soft-lavender border-b border-lavender-medium shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-lavender-deep p-1.5 rounded-lg text-white shadow-sm"><Sparkles size={20} /></div>
          <h2 className="text-xl font-bold text-lavender-deep tracking-tight">AI Safety Scan</h2>
        </div>
        <button onClick={onClose} className="p-2 text-lavender-deep/60 hover:text-lavender-deep transition-colors"><X size={24} /></button>
      </div>

      <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto bg-white">
        <div className="w-full max-w-xl mx-auto space-y-6">
          
          {error && (
            <div className="bg-blush-pink border border-blush-medium p-4 rounded-2xl flex items-center gap-3 text-blush-deep text-sm animate-in slide-in-from-top-4">
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          <div className="relative aspect-[3/4] w-full bg-soft-lavender rounded-[3rem] overflow-hidden border-4 border-white shadow-lavender group">
            {!image ? (
              <>
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-white/50 m-8 rounded-[2rem] pointer-events-none border-dashed"></div>
                <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                  <button onClick={captureImage} className="w-20 h-20 rounded-full bg-white/90 backdrop-blur-sm p-1 shadow-2xl active:scale-95 transition-transform">
                    <div className="w-full h-full rounded-full border-4 border-lavender-medium flex items-center justify-center text-lavender-deep"><Camera size={32} /></div>
                  </button>
                </div>
              </>
            ) : (
              <img src={image} alt="Scan" className="w-full h-full object-cover" />
            )}

            {analyzing && (
              <div className="absolute inset-0 bg-lavender-deep/80 flex flex-col items-center justify-center backdrop-blur-md text-white">
                <RefreshCw size={48} className="animate-spin text-calm-teal mb-4" />
                <p className="text-xl font-bold tracking-tight">Analyzing Cues...</p>
                <p className="text-white/60 text-xs font-medium uppercase tracking-widest mt-2">Vision Intelligence</p>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {result && !analyzing && (
            <div className="bg-white rounded-[2.5rem] p-8 border border-lavender-medium shadow-lavender animate-in slide-in-from-bottom-10 space-y-8 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-lavender-deep/60 uppercase tracking-[0.2em] mb-1">Safety Index</p>
                  <h3 className="text-5xl font-black text-lavender-deep">{result.psiScore}%</h3>
                </div>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm ${result.psiScore > 70 ? 'bg-calm-teal text-white' : 'bg-blush-pink text-blush-deep'}`}>
                  {result.psiScore > 70 ? <CheckCircle size={36} /> : <AlertTriangle size={36} />}
                </div>
              </div>

              <div className="bg-soft-lavender/30 border border-lavender-medium/50 p-5 rounded-2xl">
                <p className="text-slate-700 text-sm italic leading-relaxed font-medium">"{result.reasoning}"</p>
              </div>

              <div className="space-y-6">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Edit3 size={14} /> Review Findings
                </h4>
                
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-lavender-deep">
                      <Lightbulb size={16} className="text-calm-teal" /> Lighting
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {['poor', 'moderate', 'sufficient', 'visible'].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setEditedLighting(lvl)}
                          className={`py-2 px-1 rounded-xl text-[9px] font-bold uppercase transition-all border-2 ${editedLighting === lvl ? 'bg-lavender-deep border-lavender-deep text-white shadow-md' : 'bg-white text-slate-400 border-soft-lavender'}`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-lavender-deep">
                      <Users size={16} className="text-calm-teal" /> Crowd
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {['low', 'moderate', 'sufficient', 'busy'].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setEditedCrowd(lvl)}
                          className={`py-2 px-1 rounded-xl text-[9px] font-bold uppercase transition-all border-2 ${editedCrowd === lvl ? 'bg-lavender-deep border-lavender-deep text-white shadow-md' : 'bg-white text-slate-400 border-soft-lavender'}`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button 
                  onClick={submitReport} 
                  disabled={submitting || submitted}
                  className={`w-full py-5 rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95 ${submitted ? 'bg-emerald-500 text-white' : 'bg-calm-teal text-white hover:bg-calm-teal-deep'}`}
                >
                  {submitting ? <RefreshCw size={20} className="animate-spin" /> : submitted ? <><CheckCircle size={20} /> Verified</> : <><Send size={18} /> Sync with Community</>}
                </button>
                {!submitted && (
                  <button onClick={() => { setImage(null); setResult(null); }} className="w-full py-3 text-lavender-deep/60 font-bold text-xs uppercase tracking-widest hover:text-lavender-deep">Discard & Retake</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
