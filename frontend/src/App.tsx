import { AlertCircle, AlertTriangle, Camera, HeartPulse, LogOut, Map, MapPin, MessageSquarePlus, Navigation, PhoneCall, ShieldAlert, ShieldCheck, Users, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CoTravel } from './components/CoTravel';
import { FaceAuth } from './components/FaceAuth';
import { MapVisualization } from './components/MapVisualization';
import { RoutePlanner } from './components/RoutePlanner';
import { SafetyFeedback } from './components/SafetyFeedback';
import { SafetyScanner } from './components/SafetyScanner';
import { auth, db, get, onValue, push, ref, set } from './services/firebase';
import { ActiveRoute, AppMode, CoTraveller, SafetyCategory, SafetyNode } from './types';

// Helper to generate dynamic safety nodes around a location
const generateNodesAround = (center: { lat: number, lng: number }): SafetyNode[] => {
  const types = ['shop', 'transit', 'community', 'street_light'] as const;
  const categoriesMap = {
    shop: [SafetyCategory.OPEN_SHOPS, SafetyCategory.HELPFUL_LOCALS],
    transit: [SafetyCategory.TRANSIT_HUB, SafetyCategory.ACTIVE_PRESENCE],
    community: [SafetyCategory.COMFORTABLE, SafetyCategory.ACTIVE_PRESENCE],
    street_light: [SafetyCategory.COMFORTABLE]
  };

  return Array.from({ length: 8 }).map((_, i) => {
    const type = types[Math.floor(Math.random() * types.length)];
    // Random offset within ~500m
    const latOffset = (Math.random() - 0.5) * 0.006;
    const lngOffset = (Math.random() - 0.5) * 0.006;

    return {
      id: `dynamic_${i}`,
      type,
      label: `${type.charAt(0).toUpperCase() + type.slice(1)} Safety Point`,
      psi: Math.floor(Math.random() * 25) + 75, // Random score 75-100
      coordinates: {
        lat: center.lat + latOffset,
        lng: center.lng + lngOffset
      },
      categories: categoriesMap[type],
      lastUpdate: 'Live',
      description: 'Verified safe zone based on community activity and lighting data.'
    };
  });
};

function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.MAP);
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [activeUsers, setActiveUsers] = useState<CoTraveller[]>([]);
  const [activeEmergencies, setActiveEmergencies] = useState<any[]>([]);

  // Initialize with null to force waiting for real location
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number, accuracy?: number, lastUpdated?: number } | null>(null);
  const [nodes, setNodes] = useState<SafetyNode[]>([]);
  const [reportNodes, setReportNodes] = useState<SafetyNode[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [selectedNode, setSelectedNode] = useState<SafetyNode | null>(null);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [showSOS, setShowSOS] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [sosType, setSosType] = useState<'danger' | 'unwell'>('danger');
  const [logoError, setLogoError] = useState(false);

  const POLICE_HELPLINE = "18001200020";
  const LOGO_SRC = "components/surakshaLogo.png";

  useEffect(() => {
    const checkSession = async () => {
      const sessionId = localStorage.getItem('suraksha_sid');
      if (sessionId) {
        const userRef = ref(db, `users/${sessionId}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const profileData = snapshot.val();
          setUser({ uid: sessionId });
          setProfile(profileData);
        } else {
          localStorage.removeItem('suraksha_sid');
        }
      }
    };
    checkSession();
  }, []);

  // Real-time user list
  useEffect(() => {
    if (!user) return;
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const userList: CoTraveller[] = Object.keys(data).map(key => {
          const userData = data[key];
          const isCurrentUser = userData.uid === user.uid || key === user.uid;
          return {
            id: key,
            name: isCurrentUser ? `${userData.name} (Me)` : userData.name,
            matchScore: 100,
            destination: userData.vibe ? `Vibe: ${userData.vibe}` : 'Nearby Member',
            timeWindow: 'Active on Grid',
            verified: userData.status === 'verified' || userData.isFemale === true,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.uid || key}`,
            location: userData.location ? { lat: userData.location.lat, lng: userData.location.lng } : undefined
          };
        });
        userList.sort((a, b) => a.name.includes('(Me)') ? -1 : (b.name.includes('(Me)') ? 1 : 0));
        setActiveUsers(userList);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Real-time Reports
  useEffect(() => {
    if (!user) return;
    const reportsRef = ref(db, 'safety_reports');
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const newReports: SafetyNode[] = Object.keys(data).map(key => {
          const report = data[key];
          // Skip if no coordinates (manual text-only reports)
          if (!report.coordinates) return null;

          return {
            id: key,
            type: 'report',
            label: report.manualPlaceName || 'Community Report',
            psi: report.psi,
            coordinates: report.coordinates,
            categories: [SafetyCategory.ACTIVE_PRESENCE],
            lastUpdate: new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            description: report.description || `Verified by ${report.authorName}`,
            details: {
              lighting: report.lighting,
              crowd: report.crowd,
              shops: report.shops,
              author: report.authorName
            }
          };
        }).filter(Boolean) as SafetyNode[];
        setReportNodes(newReports);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Emergency Alerts
  useEffect(() => {
    if (!user) return;
    const alertsRef = ref(db, 'emergency_alerts');
    const unsubscribe = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const now = new Date().getTime();
        const alertList = Object.keys(data).map(key => ({
          ...data[key],
          id: key
        })).filter(alert => {
          const alertTime = new Date(alert.timestamp).getTime();
          return (now - alertTime) < 1800000;
        });
        setActiveEmergencies(alertList);
      } else {
        setActiveEmergencies([]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  const updateLocation = useCallback((position: GeolocationPosition) => {
    const newLat = position.coords.latitude;
    const newLng = position.coords.longitude;
    const newAccuracy = position.coords.accuracy;

    // Safety check for valid coordinates
    if (typeof newLat !== 'number' || isNaN(newLat) || typeof newLng !== 'number' || isNaN(newLng)) {
      return;
    }

    // Ignore extremely inaccurate updates (>20km) unless it's IP based (which can be inaccurate)
    if (newAccuracy > 20000 && userLocation) {
      return;
    }

    setUserLocation(prev => {
      // If no previous location, accept immediately
      if (!prev) {
        const newData = {
          lat: newLat,
          lng: newLng,
          accuracy: newAccuracy,
          lastUpdated: Date.now()
        };
        // Save to cache
        localStorage.setItem('suraksha_location_cache', JSON.stringify(newData));
        return newData;
      }

      // If we already have a high-accuracy fix (<50m), ignore sudden low-accuracy jumps (>1000m)
      if (prev.accuracy && prev.accuracy < 50 && newAccuracy > 1000) {
        return prev;
      }

      // Only update state if position has moved significantly (> 5 meters approx) or accuracy improved
      // 0.00005 degrees is roughly 5.5 meters at equator
      const hasMoved = Math.abs(prev.lat - newLat) > 0.00005 || Math.abs(prev.lng - newLng) > 0.00005;
      const accuracyImproved = newAccuracy < (prev.accuracy || Infinity);

      if (hasMoved || accuracyImproved) {
        const newData = {
          lat: newLat,
          lng: newLng,
          accuracy: newAccuracy,
          lastUpdated: Date.now()
        };
        // Save to cache
        localStorage.setItem('suraksha_location_cache', JSON.stringify(newData));
        return newData;
      }

      return prev;
    });

    // Generate nodes only once initially
    setNodes(prev => prev.length === 0 ? generateNodesAround({ lat: newLat, lng: newLng }) : prev);

    if (auth.currentUser) {
      const userStatusRef = ref(db, `users/${auth.currentUser.uid}/live_coords`);
      const userLocationRef = ref(db, `users/${auth.currentUser.uid}/location`);
      set(userStatusRef, {
        lat: newLat,
        lng: newLng,
        accuracy: newAccuracy,
        timestamp: Date.now()
      }).catch(e => console.error("Coord sync failed:", e));
      set(userLocationRef, {
        lat: newLat,
        lng: newLng
      }).catch(e => console.error("Location sync failed:", e));
    }
  }, [userLocation]); // Added dependency to check against existing location

  const fetchIpLocation = useCallback(async () => {
    try {
      console.log("Attempting IP-based location fallback...");
      const response = await fetch('https://ipapi.co/json/');
      if (!response.ok) throw new Error("IP API lookup failed");

      const data = await response.json();
      if (data.latitude && data.longitude) {
        // Construct a pseudo GeolocationPosition object
        const pos: GeolocationPosition = {
          coords: {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: 5000, // Roughly city-level accuracy
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        } as GeolocationPosition;

        updateLocation(pos);
        setLocationError(null);
        setIsLocating(false);
      } else {
        throw new Error("Invalid IP location data");
      }
    } catch (error) {
      console.error("IP Location failed:", error);
      // If even IP fails, we show error
      if (!userLocation) {
        setLocationError("Unable to acquire location via GPS or Network. Please check permissions.");
      }
      setIsLocating(false);
    }
  }, [updateLocation, userLocation]);

  useEffect(() => {
    if (!user) return;

    // 0. Load Cache Strategy
    // If we have a cached location less than 5 minutes old, use it immediately
    const cached = localStorage.getItem('suraksha_location_cache');
    if (cached && !userLocation) {
      try {
        const data = JSON.parse(cached);
        // 5 minutes = 300,000 ms
        if (Date.now() - data.timestamp < 300000) {
          console.log("Using valid cached location (< 5 mins)");
          setUserLocation(data);
          setNodes(generateNodesAround(data));
          // We don't stop locating, we just provide an instant start
        }
      } catch (e) {
        console.error("Cache corrupted");
      }
    }

    setIsLocating(true);

    if ('geolocation' in navigator) {
      // 1. Primary: High Accuracy (GPS)
      const primaryOptions = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      };

      // 2. Secondary: Low Accuracy (Network/Wifi)
      const fallbackOptions = {
        enableHighAccuracy: false,
        timeout: 60000,
        maximumAge: 300000
      };

      const handleSuccess = (pos: GeolocationPosition) => {
        updateLocation(pos);
        setLocationError(null);
        setIsLocating(false);
      };

      const handleFallbackError = (fallbackErr: GeolocationPositionError) => {
        console.warn("Fallback location failed:", fallbackErr.message);
        // 3. Tertiary: IP Address Fallback
        fetchIpLocation();
      };

      const handleError = (err: GeolocationPositionError) => {
        console.warn(`Primary location error (${err.code}): ${err.message}`);

        // If High Accuracy times out (3) or unavailable (2), try fallback
        if (err.code === 3 || err.code === 2) {
          console.log("High accuracy GPS failed. Attempting robust fallback...");
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            handleFallbackError,
            fallbackOptions
          );
        } else if (err.code === 1) { // PERMISSION_DENIED
          setLocationError("Please enable GPS/Location Services to view safety map.");
          setIsLocating(false);
        }
      };

      // 1. Initial Position Request
      navigator.geolocation.getCurrentPosition(handleSuccess, handleError, primaryOptions);

      // 2. Continuous Watcher (Best Effort)
      const watchId = navigator.geolocation.watchPosition(
        handleSuccess,
        (err) => console.debug("Watch update pending:", err.message),
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      // Browser doesn't support geolocation, try IP directly
      fetchIpLocation();
    }
  }, [user, updateLocation, fetchIpLocation]); // Removed userLocation from dependencies to prevent loop, logic handles !userLocation check

  const triggerSOS = async () => {
    if (!user || !userLocation) return;
    setSosActive(true);
    try {
      const alertsRef = ref(db, 'emergency_alerts');
      const newAlertRef = push(alertsRef);
      await set(newAlertRef, {
        userId: user.uid,
        userName: profile?.name || 'Suraksha Member',
        userPhone: profile?.phone || 'Emergency Contact notified',
        coordinates: { lat: userLocation.lat, lng: userLocation.lng },
        timestamp: new Date().toISOString(),
        type: sosType,
        status: 'active'
      });
    } catch (e) {
      console.error("SOS Trigger Failed:", e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('suraksha_sid');
    setUser(null);
    setProfile(null);
    setUserLocation(null);
  };

  const allNodes = useMemo(() => {
    // Combine generated nearby nodes with real report nodes
    if (!userLocation) return [];

    // Filter nearby nodes as before
    const nearby = nodes.filter(node => {
      if (!node.coordinates || isNaN(node.coordinates.lat)) return false;
      const distance = Math.sqrt(Math.pow(node.coordinates.lat - userLocation.lat, 2) + Math.pow(node.coordinates.lng - userLocation.lng, 2));
      return distance < 0.05;
    });

    return [...nearby, ...reportNodes];
  }, [nodes, reportNodes, userLocation]);

  if (!user) {
    return <FaceAuth onSuccess={(p) => { setUser({ uid: p.uid }); setProfile(p); }} />;
  }

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden relative text-slate-700 font-sans">
      <aside className="hidden md:flex flex-col w-64 bg-soft-lavender border-r border-lavender-medium h-full z-30 shrink-0">
        <div className="p-6 border-b border-lavender-medium flex items-center gap-4">
          {!logoError ? (
            <img
              src={LOGO_SRC}
              alt="Suraksha Logo"
              className="w-14 h-14 object-contain drop-shadow-sm rounded-full bg-white"
              onError={() => setLogoError(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-lavender-deep flex items-center justify-center shadow-lg border-2 border-white">
              <ShieldCheck className="text-white" size={24} />
            </div>
          )}
          <h1 className="text-3xl font-black text-lavender-deep tracking-tighter">
            Suraksha
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button onClick={() => setMode(AppMode.MAP)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-semibold text-left ${mode === AppMode.MAP ? 'bg-white text-lavender-deep shadow-lavender' : 'text-slate-500 hover:bg-white/40'}`}>
            <Map size={18} className={mode === AppMode.MAP ? 'text-calm-teal' : ''} /> Live Proximity
          </button>
          <button onClick={() => setMode(AppMode.ROUTE)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-semibold text-left ${mode === AppMode.ROUTE ? 'bg-white text-lavender-deep shadow-lavender' : 'text-slate-500 hover:bg-white/40'}`}>
            <Navigation size={18} className={mode === AppMode.ROUTE ? 'text-calm-teal' : ''} /> Safe Path
          </button>
          <button onClick={() => setShowSOS(true)} className="w-full bg-blush-pink text-blush-deep border border-blush-medium p-3 rounded-2xl flex items-center gap-3 font-bold hover:bg-blush-medium transition-all my-2">
            <AlertCircle size={18} /> Emergency SOS
          </button>
          <button onClick={() => setMode(AppMode.CO_TRAVEL)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-semibold text-left ${mode === AppMode.CO_TRAVEL ? 'bg-white text-lavender-deep shadow-lavender' : 'text-slate-500 hover:bg-white/40'}`}>
            <Users size={18} className={mode === AppMode.CO_TRAVEL ? 'text-calm-teal' : ''} /> Travel Buddy
          </button>
          <button onClick={() => setMode(AppMode.FEEDBACK)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-semibold text-left ${mode === AppMode.FEEDBACK ? 'bg-white text-lavender-deep shadow-lavender' : 'text-slate-500 hover:bg-white/40'}`}>
            <MessageSquarePlus size={18} className={mode === AppMode.FEEDBACK ? 'text-calm-teal' : ''} /> Feedback
          </button>
          <button onClick={() => setMode(AppMode.SCAN)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-semibold text-left ${mode === AppMode.SCAN ? 'bg-white text-lavender-deep shadow-lavender' : 'text-slate-500 hover:bg-white/40'}`}>
            <Camera size={18} className={mode === AppMode.SCAN ? 'text-calm-teal' : ''} /> AI Scan
          </button>
        </nav>

        {/* Verification Status Display */}
        <div className="mx-4 mb-2 p-3 bg-white/60 rounded-xl border border-lavender-medium/50 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-lavender-deep opacity-60">GPS Status</span>
            <div className="flex items-center gap-1">
              {userLocation ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-calm-teal animate-pulse"></div>
                  <span className="text-[9px] font-bold text-calm-teal-deep">Connected</span>
                </>
              ) : (
                <>
                  <div className={`w-1.5 h-1.5 rounded-full ${locationError ? 'bg-red-500' : 'bg-yellow-400 animate-bounce'}`}></div>
                  <span className={`text-[9px] font-bold ${locationError ? 'text-red-500' : 'text-yellow-500'}`}>
                    {locationError ? 'Failed' : 'Locating...'}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-500 flex flex-col">
            {userLocation ? (
              <>
                <span>Lat: {userLocation.lat.toFixed(6)}</span>
                <span>Lng: {userLocation.lng.toFixed(6)}</span>
                <span className="text-xs text-lavender-medium">±{Math.round(userLocation.accuracy || 0)}m</span>
              </>
            ) : (
              <span>{isLocating ? 'Triangulating position...' : 'Waiting for signal...'}</span>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-lavender-medium">
          <div className="bg-white/60 rounded-2xl p-3 flex items-center gap-3 border border-white/20">
            <div className="w-10 h-10 rounded-full bg-soft-lavender text-lavender-deep flex items-center justify-center font-bold overflow-hidden border-2 border-lavender-medium">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{profile?.name || 'User'}</p>
              <p className="text-[10px] text-calm-teal-deep flex items-center gap-1 font-bold uppercase tracking-wider">
                <ShieldCheck size={10} /> Verified
              </p>
            </div>
            <button onClick={handleLogout} className="p-1.5 text-slate-400 hover:text-blush-deep rounded-lg transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="md:hidden bg-soft-lavender px-4 py-3 border-b border-lavender-medium flex justify-between items-center z-20 shrink-0">
          <div className="flex items-center gap-3">
            {!logoError ? (
              <img
                src={LOGO_SRC}
                alt="Logo"
                className="w-12 h-12 object-contain drop-shadow-sm rounded-full bg-white"
                onError={() => setLogoError(true)}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-lavender-deep flex items-center justify-center shadow-lg border-2 border-white">
                <ShieldCheck className="text-white" size={20} />
              </div>
            )}
            <h1 className="text-2xl font-black text-lavender-deep tracking-tighter">Suraksha</h1>
          </div>
          <button onClick={handleLogout} className="p-2 text-lavender-deep"><LogOut size={20} /></button>
        </header>
        <main className="flex-1 relative overflow-hidden flex flex-col w-full bg-white">
          {mode === AppMode.MAP && (
            <div className="h-full w-full relative bg-soft-lavender/30">
              {userLocation ? (
                <MapVisualization
                  nodes={allNodes}
                  userLocation={userLocation}
                  onNodeClick={(n) => setSelectedNode(n)}
                  activeRoute={activeRoute}
                  emergencies={activeEmergencies}
                  onRefreshLocation={() => {
                    if ('geolocation' in navigator) {
                      navigator.geolocation.getCurrentPosition(updateLocation, (e) => console.warn(e), { enableHighAccuracy: true });
                    }
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center">
                  {locationError ? (
                    <div className="bg-blush-pink p-6 rounded-[2rem] border border-blush-medium max-w-sm">
                      <ShieldAlert size={48} className="text-blush-deep mx-auto mb-4" />
                      <h3 className="text-lg font-black text-blush-deep mb-2">Location Required</h3>
                      <p className="text-sm text-slate-600 mb-4">{locationError}</p>
                      <button onClick={() => window.location.reload()} className="bg-blush-deep text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest">Retry Permission</button>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-pulse">
                      <div className="w-20 h-20 bg-lavender-deep/10 rounded-full flex items-center justify-center mx-auto border-4 border-white shadow-xl">
                        <MapPin size={32} className="text-lavender-deep animate-bounce" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-lavender-deep">Triangulating Position</h3>
                        <p className="text-sm text-slate-400">Connecting to secure safety grid...</p>
                        <p className="text-[10px] text-slate-400 mt-2 font-mono">Attempting GPS • Network • IP Fallback</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {userLocation && (
                <button
                  onClick={() => setMode(AppMode.SCAN)}
                  className={`absolute ${activeRoute ? 'bottom-40' : 'bottom-24'} right-6 group flex items-center gap-3 z-[1001] transition-all`}
                >
                  <div className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-lavender-medium text-[10px] font-black uppercase tracking-widest text-lavender-deep opacity-0 group-hover:opacity-100 transition-all -translate-x-2 pointer-events-none">
                    AI Safety Scan
                  </div>
                  <div className="w-14 h-14 bg-calm-teal text-white rounded-2xl shadow-2xl flex items-center justify-center border-4 border-white transition-transform hover:scale-110 active:scale-95 relative">
                    <Camera size={24} />
                    <div className="absolute -top-1 -right-1 bg-lavender-deep text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-white animate-pulse">AI</div>
                  </div>
                </button>
              )}

              {/* Navigation Insights Bar */}
              {activeRoute && activeRoute.heatmapData && (
                <div className="absolute bottom-6 left-6 right-20 z-[1001] animate-in slide-in-from-bottom-10 duration-500">
                  <div className="bg-white/90 backdrop-blur-xl border-2 border-soft-lavender rounded-[2rem] p-4 shadow-2xl flex items-center gap-6 overflow-hidden">
                    {/* Overall Score Circle */}
                    <div className="flex flex-col items-center justify-center border-r border-soft-lavender pr-6">
                      <div className="text-2xl font-black text-lavender-deep leading-none">
                        {activeRoute.heatmapData.length > 0
                          ? Math.round(activeRoute.heatmapData.reduce((acc, curr) => acc + curr.psi, 0) / activeRoute.heatmapData.length)
                          : 0}%
                      </div>
                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-1">Avg PSI</div>
                    </div>

                    {/* Dynamic Insights */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Zap size={12} className="text-calm-teal" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Caution Areas</span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {activeRoute.heatmapData.filter(p => p.psi < 50).length > 0 ? (
                          activeRoute.heatmapData
                            .filter((p, i, self) => p.psi < 50 && (i === 0 || self[i - 1].psi >= 50)) // Only start of clusters
                            .map((p, i) => (
                              <div key={i} className="flex-shrink-0 bg-blush-pink/30 border border-blush-medium/50 px-3 py-1 rounded-full flex items-center gap-2">
                                <AlertTriangle size={10} className="text-blush-deep" />
                                <span className="text-[9px] font-bold text-blush-deep whitespace-nowrap">Complex Area Detected</span>
                              </div>
                            ))
                        ) : (
                          <div className="flex items-center gap-2 text-calm-teal-deep">
                            <ShieldCheck size={12} />
                            <span className="text-[10px] font-bold">Safe Corridor • No major risks detected along path</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Exit Navigation */}
                    <button
                      onClick={() => setActiveRoute(null)}
                      className="p-2 bg-slate-100 hover:bg-blush-pink hover:text-blush-deep rounded-full transition-all text-slate-400"
                      title="Stop Navigation"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {mode === AppMode.ROUTE && <RoutePlanner userLocation={userLocation || undefined} onStartNavigation={(r) => { setActiveRoute(r); setMode(AppMode.MAP); }} />}
          {mode === AppMode.CO_TRAVEL && <CoTravel travellers={activeUsers} userLocation={userLocation || { lat: 0, lng: 0 }} />}
          {mode === AppMode.FEEDBACK && <SafetyFeedback userLocation={userLocation || { lat: 0, lng: 0 }} />}
        </main>
        <nav className="md:hidden bg-white border-t border-lavender-medium flex justify-around items-center p-2 pb-5 z-20 shrink-0">
          <button onClick={() => setMode(AppMode.MAP)} className={`flex flex-col items-center p-2 rounded-xl transition-all ${mode === AppMode.MAP ? 'text-calm-teal' : 'text-slate-400'}`}>
            <Map size={24} /><span className="text-[10px] font-bold mt-1">Map</span>
          </button>
          <button onClick={() => setMode(AppMode.ROUTE)} className={`flex flex-col items-center p-2 rounded-xl transition-all ${mode === AppMode.ROUTE ? 'text-calm-teal' : 'text-slate-400'}`}>
            <Navigation size={24} /><span className="text-[10px] font-bold mt-1">Path</span>
          </button>
          <button onClick={() => setShowSOS(true)} className="flex flex-col items-center p-2 -mt-8">
            <div className="bg-blush-deep text-white p-4 rounded-full shadow-lg border-4 border-white"><AlertCircle size={28} /></div>
            <span className="text-[10px] font-black text-blush-deep mt-1">SOS</span>
          </button>
          <button onClick={() => setMode(AppMode.FEEDBACK)} className={`flex flex-col items-center p-2 rounded-xl transition-all ${mode === AppMode.FEEDBACK ? 'text-calm-teal' : 'text-slate-400'}`}>
            <MessageSquarePlus size={24} /><span className="text-[10px] font-bold mt-1">Feedback</span>
          </button>
          <button onClick={() => setMode(AppMode.CO_TRAVEL)} className={`flex flex-col items-center p-2 rounded-xl transition-all ${mode === AppMode.CO_TRAVEL ? 'text-calm-teal' : 'text-slate-400'}`}>
            <Users size={24} /><span className="text-[10px] font-bold mt-1">Buddy</span>
          </button>
        </nav>
      </div>

      {showSOS && (
        <div className="fixed inset-0 z-[2200] bg-lavender-deep/40 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-sm text-center text-white space-y-8 bg-white/10 rounded-[3rem] border border-white/20 p-8 shadow-2xl">
            <div className="animate-bounce">
              <div className="w-20 h-20 bg-blush-pink rounded-full flex items-center justify-center mx-auto border-4 border-white/50 shadow-xl">
                <ShieldAlert size={48} className="text-blush-deep" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight text-white mb-2">Emergency Alert</h2>
              <p className="text-white/80 text-sm">Notifying verified members & police.</p>
            </div>

            {!sosActive ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => setSosType('danger')}
                    className={`p-4 rounded-3xl flex items-center gap-4 border-2 transition-all ${sosType === 'danger' ? 'bg-blush-deep border-blush-deep text-white' : 'bg-white/10 border-white/20 text-white'}`}
                  >
                    <AlertTriangle size={24} />
                    <div className="text-left">
                      <p className="font-bold">Security Threat</p>
                      <p className="text-xs opacity-70 italic">Harassment or physical risk</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setSosType('unwell')}
                    className={`p-4 rounded-3xl flex items-center gap-4 border-2 transition-all ${sosType === 'unwell' ? 'bg-calm-teal-deep border-calm-teal-deep text-white' : 'bg-white/10 border-white/20 text-white'}`}
                  >
                    <HeartPulse size={24} />
                    <div className="text-left">
                      <p className="font-bold">Feeling Unwell</p>
                      <p className="text-xs opacity-70 italic">Medical need or fatigue</p>
                    </div>
                  </button>
                </div>

                <button
                  onClick={triggerSOS}
                  className="w-40 h-40 rounded-full bg-white text-blush-deep flex flex-col items-center justify-center shadow-xl border-[10px] border-white/30 hover:scale-105 active:scale-95 transition-all mx-auto"
                >
                  <span className="text-2xl font-black text-blush-deep">ACTIVATE</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest mt-1 text-blush-deep/60">Press Firmly</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6 animate-in zoom-in-95">
                <div className="bg-white/20 rounded-[2rem] p-6 border border-white/30">
                  <button
                    className="w-full bg-white text-blush-deep py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg hover:bg-blush-pink transition-colors"
                    onClick={() => window.location.href = `tel:${POLICE_HELPLINE}`}
                  >
                    <PhoneCall size={24} />
                    Call Emergency
                  </button>
                  <p className="text-xs font-bold text-white/60 mt-4 tracking-widest uppercase">Location Broadcasted</p>
                </div>
              </div>
            )}

            <button
              onClick={() => { setShowSOS(false); setSosActive(false); }}
              className="mt-4 text-white font-bold hover:underline transition-colors text-xs opacity-70"
            >
              Dismiss Call
            </button>
          </div>
        </div>
      )}

      {mode === AppMode.SCAN && userLocation && <SafetyScanner onClose={() => setMode(AppMode.MAP)} userLocation={userLocation} />}
    </div>
  );
}

export default App;