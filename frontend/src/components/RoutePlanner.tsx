
import React, { useState, useEffect, useRef } from 'react';
import { Search, Map as MapIcon, ArrowRight, Zap, MapPin, Loader2, Navigation, Crosshair, Sparkles, ShieldCheck, Volume2, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getRouteSafetyAdviceWithSearch, speakSafetyAdvice, RouteSafetyAnalysis } from '../services/geminiService';
import { psiService } from '../services/psiService';
import { ActiveRoute, Coordinates } from '../types';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface LocationInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onSelectCoordinates: (coords: Coordinates) => void;
  icon: React.ElementType;
  onUseCurrentLocation?: () => void;
  isLoading?: boolean;
}

const LocationInput: React.FC<LocationInputProps> = ({ label, placeholder, value, onChange, onSelectCoordinates, icon: Icon, onUseCurrentLocation, isLoading }) => {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (value.length > 2 && showSuggestions && !isLoading) {
        setLoading(true);
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&countrycodes=in&limit=5&addressdetails=1`
          );
          const data = await response.json();
          setSuggestions(data);
        } catch (error) {
          console.error("Error fetching location suggestions:", error);
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      } else {
        setSuggestions([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [value, showSuggestions, isLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setShowSuggestions(true);
  };

  const handleSelectSuggestion = (suggestion: NominatimResult) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);

    if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
      onChange(suggestion.display_name);
      onSelectCoordinates({ lat, lng });
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  return (
    <div className="relative mb-6" ref={wrapperRef}>
      <label className="text-[10px] font-black text-lavender-deep uppercase tracking-widest mb-2 ml-1 block">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-lavender-medium">
          <Icon size={18} />
        </div>
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setShowSuggestions(true)}
          placeholder={placeholder}
          className="w-full bg-soft-lavender/20 border-2 border-soft-lavender rounded-2xl py-4 pl-12 pr-12 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-lavender-deep focus:border-transparent transition-all"
        />
        {(loading || isLoading) && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 size={18} className="animate-spin text-calm-teal" />
          </div>
        )}
        {!loading && !isLoading && onUseCurrentLocation && (
          <button
            onClick={onUseCurrentLocation}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-lavender-medium hover:text-calm-teal transition-colors"
          >
            <Crosshair size={18} />
          </button>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-lavender border border-soft-lavender max-h-60 overflow-y-auto overflow-hidden animate-in fade-in slide-in-from-top-2">
          {suggestions.map((item) => (
            <button
              key={item.place_id}
              onClick={() => handleSelectSuggestion(item)}
              className="w-full text-left px-5 py-4 hover:bg-soft-lavender border-b border-soft-lavender last:border-0 transition-colors flex items-start gap-3"
            >
              <MapPin size={16} className="mt-1 text-lavender-medium shrink-0" />
              <span className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium">{item.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Extend the imported RouteSafetyAnalysis type to include heatmapData
// This is a local type definition to ensure the state variable `analysis` has the correct shape
type ExtendedRouteSafetyAnalysis = RouteSafetyAnalysis & {
  heatmapData?: Array<{ lat: number; lng: number; psi: number }>;
};

interface RoutePlannerProps {
  userLocation?: { lat: number; lng: number };
  onStartNavigation: (route: ActiveRoute) => void;
}

export const RoutePlanner: React.FC<RoutePlannerProps> = ({ userLocation, onStartNavigation }) => {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [startCoords, setStartCoords] = useState<Coordinates | null>(null);
  const [endCoords, setEndCoords] = useState<Coordinates | null>(null);

  const [analysis, setAnalysis] = useState<ExtendedRouteSafetyAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [locatingUser, setLocatingUser] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const handleFindSafeRoute = async () => {
    if (!startCoords || !endCoords) return;

    setLoading(true);
    setAnalysis(null);
    try {
      // 1. Fetch live Gemini advice (for risks/safe spots)
      const geminiResult = await getRouteSafetyAdviceWithSearch(start, end, "Now");

      // 2. Fetch actual route geometries from OSRM (request alternatives)
      const osrmUrl = `https://router.project-osrm.org/route/v1/walking/${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}?overview=full&geometries=geojson&alternatives=true`;
      const osrmRes = await fetch(osrmUrl);
      const osrmData = await osrmRes.json();

      let finalScore = geminiResult.safetyScore;
      let heatmapPoints: Array<{ lat: number; lng: number; psi: number }> | undefined = undefined;

      if (osrmData.routes && osrmData.routes.length > 0) {
        // Convert OSRM routes to the format Python expects: [[[lat, lng], [lat, lng], ...], ...]
        const routesForPython = osrmData.routes.map((r: any) =>
          r.geometry.coordinates.map((c: number[]) => [c[1], c[0]]) // OSRM is [lng, lat], Python expects [lat, lng]
        );

        try {
          // 3. Ask Python to pick the safest route
          const pythonResult = await psiService.findSafestRoute(routesForPython);

          // Override Gemini score with our local AI-predicted PSI score
          finalScore = Math.round(pythonResult.safest_psi);
          heatmapPoints = pythonResult.heatmap_data;
        } catch (backendError) {
          console.warn("Local PSI Backend unavailable or CORS error. Falling back to Gemini score.");
          // We keep the Gemini score and don't show the heatmap
        }
      }

      setAnalysis({
        ...geminiResult,
        safetyScore: finalScore,
        heatmapData: heatmapPoints
      });

      setLoading(false);
      setShowRoute(true);
    } catch (e) {
      console.error("Safety routing failed:", e);
      setLoading(false);
    }
  };

  const handleSpeak = async () => {
    if (!analysis) return;
    setSpeaking(true);
    // Construct a readable string from the structured analysis
    const speechText = `${analysis.summary}. Risks include: ${analysis.riskFactors.join(', ')}. Safe spots: ${analysis.safeZones.join(', ')}.`;
    await speakSafetyAdvice(speechText);
    setSpeaking(false);
  };

  const handleUseCurrentLocation = async () => {
    if (!userLocation) return;
    setLocatingUser(true);
    setStartCoords({ lat: userLocation.lat, lng: userLocation.lng });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}`);
      const data = await res.json();
      setStart(data.display_name || "Current Location");
    } catch (e) {
      setStart("Current Location");
    } finally {
      setLocatingUser(false);
    }
  };

  if (showRoute && analysis) {
    return (
      <div className="h-full bg-white p-4 md:p-8 overflow-y-auto flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-6">
          <div className="bg-white rounded-[2.5rem] p-6 md:p-8 border-2 border-soft-lavender shadow-lavender animate-in zoom-in-95">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black text-lavender-deep tracking-tight">Safest Path</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">AI-Verified Corridor</p>
              </div>
              <div className={`flex flex-col items-end`}>
                <div className="text-3xl font-black text-calm-teal-deep">{analysis.safetyScore}%</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Confidence</div>
              </div>
            </div>

            {/* Locations */}
            <div className="bg-soft-lavender/20 rounded-2xl p-4 mb-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-lavender-deep shadow-[0_0_8px_rgba(126,34,206,0.6)]"></div>
                <span className="text-xs font-bold text-slate-600 truncate">{start}</span>
              </div>
              <div className="pl-1.5 opacity-30">
                <div className="w-0.5 h-4 bg-slate-400 border-l border-dashed"></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-calm-teal shadow-[0_0_8px_rgba(45,212,191,0.6)]"></div>
                <span className="text-xs font-bold text-slate-600 truncate">{end}</span>
              </div>
            </div>

            {/* Summary Card */}
            <div className="bg-gradient-to-br from-lavender-deep to-lavender-medium rounded-2xl p-5 mb-6 text-white relative overflow-hidden shadow-lg">
              <div className="flex items-center justify-between mb-2 relative z-10">
                <h3 className="font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                  <Sparkles size={12} /> Executive Summary
                </h3>
                <button onClick={handleSpeak} disabled={speaking} className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-all">
                  {speaking ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                </button>
              </div>
              <p className="text-sm font-medium leading-relaxed opacity-95 relative z-10">"{analysis.summary}"</p>
              <div className="absolute -bottom-6 -right-6 text-white/10 rotate-12">
                <ShieldCheck size={100} />
              </div>
            </div>

            {/* Structured Insights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Risks */}
              <div className="bg-blush-pink/20 border border-blush-medium/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 text-blush-deep">
                  <AlertTriangle size={16} />
                  <h4 className="font-black text-[10px] uppercase tracking-widest">Precautions</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.riskFactors.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="mt-1 w-1 h-1 rounded-full bg-blush-deep shrink-0"></span>
                      <span className="leading-snug">{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Safe Zones */}
              <div className="bg-calm-teal/10 border border-calm-teal/30 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 text-calm-teal-deep">
                  <CheckCircle2 size={16} />
                  <h4 className="font-black text-[10px] uppercase tracking-widest">Safe Zones</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.safeZones.map((zone, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="mt-1 w-1 h-1 rounded-full bg-calm-teal-deep shrink-0"></span>
                      <span className="leading-snug">{zone}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Sources */}
            {analysis.sources.length > 0 && (
              <div className="mb-8">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Search size={10} /> Verified Data Sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {analysis.sources.slice(0, 3).map((chunk, idx) => (
                    chunk.web && (
                      <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-500 hover:text-calm-teal-deep hover:border-calm-teal transition-all truncate max-w-[150px]">
                        <ExternalLink size={10} /> {chunk.web.title}
                      </a>
                    )
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button className="bg-calm-teal text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-calm-teal-deep active:scale-95 transition-all flex items-center justify-center gap-3" onClick={() => onStartNavigation({
                start: startCoords!,
                end: endCoords!,
                startLabel: start,
                endLabel: end,
                heatmapData: analysis.heatmapData
              })}
              >
                <Navigation size={18} /> Start Navigation
              </button>
              <button onClick={() => setShowRoute(false)} className="py-4 bg-white border-2 border-soft-lavender text-lavender-deep/60 rounded-2xl font-black uppercase tracking-widest text-xs hover:border-lavender-medium hover:text-lavender-deep transition-all">
                Edit Path
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-6 md:p-10 bg-white flex flex-col justify-center items-center overflow-y-auto w-full">
      <div className="w-full max-w-md space-y-10 animate-in fade-in slide-in-from-bottom-6">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 bg-soft-lavender rounded-[2rem] flex items-center justify-center mx-auto shadow-lavender border-4 border-white">
            <MapIcon size={40} className="text-lavender-deep" />
          </div>
          <h2 className="text-3xl font-black text-lavender-deep tracking-tight">Route Confidence</h2>
          <p className="text-slate-400 text-sm font-medium px-4">Suraksha maps paths with verified open storefronts and community presence.</p>
        </div>

        <div className="bg-white p-8 rounded-[3rem] border-2 border-soft-lavender shadow-lavender space-y-2">
          <LocationInput label="Origin" placeholder="Current Location or Search..." value={start} onChange={setStart} onSelectCoordinates={setStartCoords} icon={Navigation} onUseCurrentLocation={handleUseCurrentLocation} isLoading={locatingUser} />
          <div className="flex justify-center -my-6 relative z-10">
            <div className="bg-white p-3 rounded-full border-2 border-soft-lavender text-lavender-medium shadow-sm"><ArrowRight size={20} className="rotate-90" /></div>
          </div>
          <LocationInput label="Destination" placeholder="Search destination..." value={end} onChange={setEnd} onSelectCoordinates={setEndCoords} icon={MapPin} />

          <button
            onClick={handleFindSafeRoute}
            disabled={!start || !end || !startCoords || !endCoords || loading}
            className="w-full bg-lavender-deep text-white py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl hover:bg-lavender-medium transition-all disabled:opacity-50 flex items-center justify-center gap-3 mt-8 active:scale-95"
          >
            {loading ? (
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="animate-spin" />
                <span>Scanning Route...</span>
              </div>
            ) : "Generate Safe Route"}
          </button>
        </div>
      </div>
    </div>
  );
};
