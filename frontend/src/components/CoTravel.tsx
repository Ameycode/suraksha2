
import React, { useState, useEffect } from 'react';
import { UserCheck, Navigation, Clock, Shield, User, Send, Check, Loader2, Bell, X, CheckCircle, ShieldCheck, MapPin } from 'lucide-react';
import { CoTraveller } from '../types';
import { db, ref, push, set, auth, onValue, update } from '../services/firebase';

interface CoTravelProps {
  travellers: CoTraveller[];
  userLocation: { lat: number; lng: number; accuracy?: number; isDefault?: boolean; lastUpdated?: number; };
}

interface IncomingAlert {
  id: string;
  fromId: string;
  fromName: string;
  timestamp: string;
  status: 'pending' | 'accepted' | 'dismissed';
  message: string;
  fromAvatar?: string;
}

// Helper function to calculate distance between two coordinates using Haversine formula
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper function to format distance
const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return Math.round(meters) + ' m';
  }
  return (meters / 1000).toFixed(1) + ' km';
};

export const CoTravel: React.FC<CoTravelProps> = ({ travellers, userLocation }) => {
  const [alertingId, setAlertingId] = useState<string | null>(null);
  const [sentAlerts, setSentAlerts] = useState<Set<string>>(new Set());
  const [incomingAlerts, setIncomingAlerts] = useState<IncomingAlert[]>([]);

  // Filter travellers to show only those within 50 meters
  const nearbyTravellers = userLocation 
    ? travellers
        .map(t => ({
          ...t,
          distance: t.location 
            ? calculateDistance(userLocation.lat, userLocation.lng, t.location.lat, t.location.lng)
            : undefined
        }))
        .filter(t => {
          // Always show current user, show others only if within 50 meters
          return t.name.includes('(Me)') || (t.distance !== undefined && t.distance <= 50);
        })
        .sort((a, b) => {
          // Sort: current user first, then by distance
          if (a.name.includes('(Me)')) return -1;
          if (b.name.includes('(Me)')) return 1;
          return (a.distance || Infinity) - (b.distance || Infinity);
        })
    : travellers;

  useEffect(() => {
    if (!auth.currentUser) return;

    const requestsRef = ref(db, 'buddy_requests');
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const myAlerts: IncomingAlert[] = Object.keys(data)
          .map(key => ({ ...data[key], id: key }))
          .filter(req => req.toId === auth.currentUser?.uid && req.status === 'pending');
        
        const enriched = myAlerts.map(alert => {
          const sender = travellers.find(t => t.id === alert.fromId);
          return {
            ...alert,
            fromName: sender?.name.replace(' (Me)', '') || 'Unknown Member',
            fromAvatar: sender?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${alert.fromId}`
          };
        });
        
        setIncomingAlerts(enriched);
      } else {
        setIncomingAlerts([]);
      }
    });

    return () => unsubscribe();
  }, [travellers]);

  const handleAlertBuddy = async (buddy: CoTraveller) => {
    if (!auth.currentUser) return;
    
    setAlertingId(buddy.id);
    try {
      const buddyRequestRef = ref(db, 'buddy_requests');
      const newRequestRef = push(buddyRequestRef);
      
      await set(newRequestRef, {
        fromId: auth.currentUser.uid,
        toId: buddy.id,
        type: 'BUDDY_REQUEST',
        timestamp: new Date().toISOString(),
        status: 'pending',
        message: 'Requesting to sync travel routes for safety.'
      });

      setSentAlerts(prev => new Set(prev).add(buddy.id));
      setTimeout(() => setAlertingId(null), 1000);
    } catch (error) {
      console.error("Failed to send buddy alert:", error);
      setAlertingId(null);
    }
  };

  const handleResponse = async (alertId: string, status: 'accepted' | 'dismissed') => {
    try {
      const alertRef = ref(db, `buddy_requests/${alertId}`);
      await update(alertRef, { status });
      if (status === 'accepted') {
        alert('Buddy request accepted!');
      }
    } catch (error) {
      console.error("Failed to respond to alert:", error);
    }
  };

  return (
    <div className="p-4 h-full overflow-y-auto bg-white">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {incomingAlerts.length > 0 && (
          <div className="animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2 mb-4 px-2">
              <div className="relative">
                <Bell size={18} className="text-blush-deep fill-blush-pink" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blush-deep rounded-full border-2 border-white animate-ping"></span>
              </div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Active Buddy Alerts ({incomingAlerts.length})</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {incomingAlerts.map((alert) => (
                <div key={alert.id} className="bg-blush-pink/30 border border-blush-medium rounded-[2rem] p-5 flex items-center gap-4 shadow-sm relative overflow-hidden group">
                  <div className="w-14 h-14 rounded-full border-2 border-white shadow-sm overflow-hidden bg-white shrink-0">
                    <img src={alert.fromAvatar} alt="Sender" className="w-full h-full object-cover" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-blush-deep uppercase tracking-widest mb-0.5">Incoming Request</p>
                    <h4 className="font-bold text-slate-800 text-sm truncate">{alert.fromName}</h4>
                    <p className="text-[10px] text-slate-500 truncate">{alert.message}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleResponse(alert.id, 'accepted')}
                      className="bg-calm-teal text-white p-3 rounded-2xl shadow-lg hover:bg-calm-teal-deep transition-all active:scale-95"
                    >
                      <CheckCircle size={20} />
                    </button>
                    <button 
                      onClick={() => handleResponse(alert.id, 'dismissed')}
                      className="bg-white text-slate-400 p-3 rounded-2xl border border-blush-medium hover:text-blush-deep transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-lavender-deep rounded-[3rem] p-10 text-white shadow-lavender relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Shield size={140} />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black mb-3 tracking-tight">Buddy Network</h2>
            <p className="opacity-80 text-sm mb-8 max-w-2xl leading-relaxed">
              Connect with verified members active nearby (within 50 meters). Send a "Buddy Alert" to coordinate paths or request mutual live-tracking for enhanced safety.
            </p>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-white/10 w-fit px-5 py-2.5 rounded-full border border-white/20">
               {/* Added missing ShieldCheck icon */}
               <ShieldCheck size={16} className="text-calm-teal" />
               <span>Identity Verified Grid</span>
            </div>
          </div>
        </div>

        {nearbyTravellers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-soft-lavender/20 rounded-[3rem] border-2 border-dashed border-lavender-medium">
            <User className="text-lavender-medium mb-4" size={56} />
            <p className="text-slate-800 font-bold">No members within 50 meters</p>
            <p className="text-slate-400 text-xs mt-1">Members nearby will appear as they come within range.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-10">
            {nearbyTravellers.map((member) => {
              const isMe = member.name.includes('(Me)');
              const isAlerting = alertingId === member.id;
              const hasSent = sentAlerts.has(member.id);

              return (
                <div key={member.id} className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all flex gap-4 items-center hover:shadow-lavender group ${isMe ? 'border-calm-teal bg-calm-teal/5' : 'border-soft-lavender hover:border-lavender-medium'}`}>
                   <div className="relative shrink-0">
                     <div className="w-16 h-16 rounded-[1.5rem] border-2 border-white shadow-sm overflow-hidden group-hover:scale-105 transition-transform">
                       <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
                     </div>
                     {member.verified && (
                       <div className="absolute -bottom-1 -right-1 bg-calm-teal text-white p-1 rounded-lg border-2 border-white">
                         {/* Added missing ShieldCheck icon */}
                         <ShieldCheck size={12} />
                       </div>
                     )}
                   </div>
                   
                   <div className="flex-1 min-w-0">
                     <h3 className={`font-bold truncate text-sm uppercase tracking-tight ${isMe ? 'text-calm-teal-deep' : 'text-slate-800'}`}>{member.name}</h3>
                     <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium truncate mt-1">
                       {/* Distance display */}
                       <MapPin size={10} className="text-lavender-deep" />
                       <span className="truncate">
                         {isMe ? 'Your Location' : (member.distance !== undefined ? `${formatDistance(member.distance)} away` : 'Nearby Member')}
                       </span>
                     </div>
                     <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium truncate mt-0.5">
                       <span className="truncate">{member.destination}</span>
                     </div>
                   </div>

                   {!isMe && (
                     <button 
                       onClick={() => handleAlertBuddy(member)}
                       disabled={isAlerting || hasSent}
                       className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all shadow-md active:scale-95 ${
                         hasSent 
                           ? 'bg-calm-teal text-white' 
                           : isAlerting 
                             ? 'bg-soft-lavender text-lavender-deep' 
                             : 'bg-lavender-deep text-white hover:bg-lavender-medium'
                       }`}
                     >
                       {isAlerting ? <Loader2 size={20} className="animate-spin" /> : hasSent ? <Check size={20} /> : <Send size={18} />}
                     </button>
                   )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
