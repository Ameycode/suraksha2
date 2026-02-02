
import React, { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat } from 'ol/proj';
import Overlay from 'ol/Overlay';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { circular as circularPolygon } from 'ol/geom/Polygon';
import { SafetyNode, ActiveRoute } from '../types';
import { Navigation, Clock, User, X } from 'lucide-react';

interface MapVisualizationProps {
  nodes: SafetyNode[];
  userLocation: { lat: number, lng: number, accuracy?: number };
  onNodeClick: (node: SafetyNode) => void;
  onRefreshLocation?: () => void;
  activeRoute?: ActiveRoute | null;
  emergencies?: any[];
}

export const MapVisualization: React.FC<MapVisualizationProps> = ({
  nodes,
  userLocation,
  onNodeClick,
  onRefreshLocation,
  activeRoute,
  emergencies = []
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const userOverlayRef = useRef<Overlay | null>(null);
  const userElRef = useRef<HTMLDivElement>(null);
  const popupContainerRef = useRef<HTMLDivElement>(null);
  const popupOverlayRef = useRef<Overlay | null>(null);
  const [popupContent, setPopupContent] = useState<SafetyNode | null>(null);

  // Keep track of node overlays to cleanup
  const nodeOverlaysRef = useRef<Overlay[]>([]);
  const vectorSourceRef = useRef<VectorSource | null>(null);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;

    // Base Vector Source for Routes & Accuracy
    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => {
        // Dynamic styling based on feature type
        const type = feature.get('type');
        if (type === 'route-glow') {
          return new Style({
            stroke: new Stroke({ color: '#2DD4BF', width: 12, lineCap: 'round' }), // Glow
          });
        }
        if (type === 'route-line') {
          return new Style({
            stroke: new Stroke({ color: '#7E22CE', width: 4, lineDash: [10, 10] }), // Dotted line
          });
        }
        if (type === 'route-segment') {
          const psi = feature.get('psi') || 50;
          // Red for low PSI, Yellow for medium, Green for high
          let color = '#FF4D4D'; // Red
          if (psi > 70) color = '#2DD4BF'; // Green/Teal
          else if (psi > 40) color = '#FACC15'; // Yellow

          return [
            // Dark Outline
            new Style({
              stroke: new Stroke({ color: 'rgba(0,0,0,0.1)', width: 12, lineCap: 'round' }),
            }),
            // Colored Segment
            new Style({
              stroke: new Stroke({ color: color, width: 8, lineCap: 'round' }),
            })
          ];
        }
        if (type === 'accuracy') {
          return new Style({
            fill: new Fill({ color: 'rgba(45, 212, 191, 0.15)' }),
            stroke: new Stroke({ color: 'rgba(45, 212, 191, 0.5)', width: 1 })
          });
        }
        return new Style({});
      }
    });

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        vectorLayer
      ],
      view: new View({
        center: fromLonLat([userLocation.lng, userLocation.lat]),
        zoom: 16,
      }),
      controls: [] // Hide default controls
    });

    mapInstance.current = map;

    // Create User Overlay
    if (userElRef.current) {
      const overlay = new Overlay({
        element: userElRef.current,
        positioning: 'center-center',
        stopEvent: false,
      });
      map.addOverlay(overlay);
      userOverlayRef.current = overlay;
    }

    // Create Popup Overlay
    if (popupContainerRef.current) {
      const popup = new Overlay({
        element: popupContainerRef.current,
        positioning: 'bottom-center',
        stopEvent: true,
        offset: [0, -45],
        autoPan: {
          animation: {
            duration: 250,
          },
        },
      });
      map.addOverlay(popup);
      popupOverlayRef.current = popup;
    }

    // Cleanup
    return () => {
      map.setTarget(undefined);
      mapInstance.current = null;
    };
  }, []);

  const closePopup = () => {
    setPopupContent(null);
    popupOverlayRef.current?.setPosition(undefined);
  };

  // 2. Update User Position & Accuracy
  useEffect(() => {
    if (!mapInstance.current || !userOverlayRef.current || !vectorSourceRef.current) return;

    const coords = fromLonLat([userLocation.lng, userLocation.lat]);

    // Update Marker Position
    userOverlayRef.current.setPosition(coords);

    // Update Accuracy Circle (re-create feature)
    const source = vectorSourceRef.current;

    // Remove old accuracy feature
    const features = source.getFeatures();
    const oldAcc = features.find(f => f.get('type') === 'accuracy');
    if (oldAcc) source.removeFeature(oldAcc);

    // Only show accuracy circle if we have a reading AND it's reasonably precise (< 500m)
    if (userLocation.accuracy && userLocation.accuracy < 500) {
      const circle = circularPolygon([userLocation.lng, userLocation.lat], userLocation.accuracy);
      circle.transform('EPSG:4326', 'EPSG:3857'); // Transform to map projection

      const accFeature = new Feature(circle);
      accFeature.set('type', 'accuracy');
      source.addFeature(accFeature);
    }

    // Auto-center logic (only on first load or significant jump)
    const view = mapInstance.current.getView();
    // Only center if user is far away to prevent annoying jumps during minor GPS drift
    // ... logic can be added here
  }, [userLocation]);

  // 3. Render Safety Nodes & Emergencies (Using Overlays)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Cleanup old node overlays
    nodeOverlaysRef.current.forEach(overlay => map.removeOverlay(overlay));
    nodeOverlaysRef.current = [];

    // Render Nodes
    nodes.forEach(node => {
      const el = document.createElement('div');
      const isHighPsi = node.psi >= 80;
      const isReport = node.type === 'report';
      let colorClass = isHighPsi ? 'bg-calm-teal' : 'bg-lavender-medium';
      if (isReport) colorClass = 'bg-blush-deep'; // Distinct color for user reports

      let emoji = '📍';
      switch (node.type) {
        case 'shop': emoji = '🛍️'; break;
        case 'transit': emoji = '🚌'; break;
        case 'community': emoji = '👥'; break;
        case 'street_light': emoji = '💡'; break;
        case 'report': emoji = '💬'; break;
      }

      el.innerHTML = `
        <div class="marker-pin ${colorClass} cursor-pointer hover:scale-110 transition-transform shadow-lavender"></div>
        <div class="marker-emoji cursor-pointer">${emoji}</div>
      `;

      el.addEventListener('click', () => {
        setPopupContent(node);
        popupOverlayRef.current?.setPosition(fromLonLat([node.coordinates.lng, node.coordinates.lat]));
        onNodeClick(node);
      });

      const overlay = new Overlay({
        element: el,
        position: fromLonLat([node.coordinates.lng, node.coordinates.lat]),
        positioning: 'bottom-center',
        stopEvent: true
      });

      map.addOverlay(overlay);
      nodeOverlaysRef.current.push(overlay);
    });

    // Render Emergencies
    emergencies.forEach(alert => {
      const el = document.createElement('div');
      const isUnwell = alert.type === 'unwell';
      const colorClass = isUnwell ? 'bg-lavender-deep' : 'bg-blush-deep';
      const emoji = isUnwell ? '💜' : '🆘';

      el.innerHTML = `
        <div class="marker-pin ${colorClass} animate-bounce"></div>
        <div class="marker-emoji">${emoji}</div>
      `;

      const overlay = new Overlay({
        element: el,
        position: fromLonLat([alert.coordinates.lng, alert.coordinates.lat]),
        positioning: 'bottom-center'
      });

      map.addOverlay(overlay);
      nodeOverlaysRef.current.push(overlay);
    });

  }, [nodes, emergencies, onNodeClick]);

  // 4. Render Route
  useEffect(() => {
    if (!vectorSourceRef.current || !mapInstance.current) return;
    const source = vectorSourceRef.current;

    // Clear old route features
    const features = source.getFeatures();
    features.forEach(f => {
      if (f.get('type')?.startsWith('route')) source.removeFeature(f);
    });

    if (activeRoute) {
      const fetchRoute = async () => {
        try {
          const response = await fetch(
            `https://router.project-osrm.org/route/v1/walking/${activeRoute.start.lng},${activeRoute.start.lat};${activeRoute.end.lng},${activeRoute.end.lat}?overview=full&geometries=geojson`
          );
          const data = await response.json();

          let coordinates = [];

          if (data.routes && data.routes.length > 0) {
            coordinates = data.routes[0].geometry.coordinates.map((coord: number[]) => fromLonLat(coord));
          } else {
            coordinates = [
              fromLonLat([activeRoute.start.lng, activeRoute.start.lat]),
              fromLonLat([activeRoute.end.lng, activeRoute.end.lat])
            ];
          }

          if (activeRoute.heatmapData && activeRoute.heatmapData.length > 1) {
            // Render heatmap segments
            for (let i = 0; i < activeRoute.heatmapData.length - 1; i++) {
              const p1 = activeRoute.heatmapData[i];
              const p2 = activeRoute.heatmapData[i + 1];

              const segment = new LineString([
                fromLonLat([p1.lng, p1.lat]),
                fromLonLat([p2.lng, p2.lat])
              ]);

              const segmentFeature = new Feature(segment);
              segmentFeature.set('type', 'route-segment');
              segmentFeature.set('psi', p1.psi);
              source.addFeature(segmentFeature);
            }
          } else {
            // Fallback to standard OSRM display
            const lineString = new LineString(coordinates);
            const glowFeature = new Feature(lineString);
            glowFeature.set('type', 'route-glow');
            const lineFeature = new Feature(lineString);
            lineFeature.set('type', 'route-line');

            source.addFeature(glowFeature);
            source.addFeature(lineFeature);
          }

          const fullBounds = new LineString(coordinates);
          const extent = fullBounds.getExtent();
          mapInstance.current?.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 1000 });

        } catch (error) {
          console.error("OSRM Error:", error);
        }
      };
      fetchRoute();
    }
  }, [activeRoute]);

  const handleRecenter = () => {
    if (onRefreshLocation) onRefreshLocation();
    mapInstance.current?.getView().animate({
      center: fromLonLat([userLocation.lng, userLocation.lat]),
      zoom: 17,
      duration: 1000
    });
  };

  return (
    <div className="relative w-full h-full bg-white overflow-hidden animate-in fade-in duration-700">
      {/* Map Container */}
      <div ref={mapRef} className="map-container bg-soft-lavender/30" />

      {/* User Marker Element */}
      <div ref={userElRef} className="pointer-events-none">
        <div className="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
          <div className="absolute -top-10 bg-white border border-lavender-medium px-2 py-1 rounded shadow-sm whitespace-nowrap z-50 animate-in fade-in slide-in-from-bottom-1">
            <span className="text-[10px] font-bold text-lavender-deep uppercase tracking-wide">You are here</span>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white"></div>
          </div>
          <div className="w-4 h-4 bg-lavender-deep rounded-full border-2 border-white shadow-xl z-10 relative"></div>
          <div className="absolute w-12 h-12 bg-lavender-deep rounded-full animate-ping opacity-30"></div>
        </div>
      </div>

      {/* Popup Element */}
      <div ref={popupContainerRef} className="absolute z-50">
        {popupContent && (
          <div className="bg-white rounded-2xl p-4 shadow-xl border border-lavender-medium w-64 animate-in zoom-in-95 origin-bottom relative">
            <button onClick={closePopup} className="absolute top-2 right-2 text-slate-400 hover:text-lavender-deep"><X size={14} /></button>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{popupContent.type === 'report' ? '💬' : '📍'}</span>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-800 text-sm truncate">{popupContent.label}</h4>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Clock size={10} /> {popupContent.lastUpdate}
                </div>
              </div>
            </div>

            <div className="bg-soft-lavender/30 rounded-lg p-2 mb-2 text-xs text-slate-600 font-medium leading-relaxed">
              {popupContent.description}
            </div>

            {popupContent.details && (
              <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                <div className="bg-white border border-soft-lavender rounded p-1 text-center">
                  Light: {popupContent.details.lighting || 'N/A'}
                </div>
                <div className="bg-white border border-soft-lavender rounded p-1 text-center">
                  Crowd: {popupContent.details.crowd || 'N/A'}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-soft-lavender pt-2">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Safety Index</span>
                <span className={`text-lg font-black ${popupContent.psi >= 80 ? 'text-calm-teal-deep' : 'text-blush-deep'}`}>{popupContent.psi}%</span>
              </div>
              {popupContent.details?.author && (
                <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-full">
                  <User size={10} /> {popupContent.details.author}
                </div>
              )}
            </div>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-white"></div>
          </div>
        )}
      </div>

      {/* Legend & Controls */}
      <div className="absolute top-6 right-6 z-[1001] bg-white/95 backdrop-blur-md p-4 rounded-[1.5rem] border border-lavender-medium shadow-xl flex flex-col gap-3 pointer-events-none md:flex">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-lavender-deep ring-4 ring-lavender-deep/20"></div>
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">You</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-calm-teal ring-4 ring-calm-teal/20"></div>
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Safe Zone</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-blush-deep ring-4 ring-blush-deep/20"></div>
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Report</span>
        </div>
      </div>

      <button
        onClick={handleRecenter}
        className="absolute bottom-40 right-6 z-[1001] bg-white w-14 h-14 rounded-full shadow-lavender border-2 border-soft-lavender text-lavender-deep hover:text-calm-teal transition-all flex items-center justify-center active:scale-90"
        title="Re-center Map"
      >
        <Navigation size={26} className="fill-current" />
      </button>
    </div>
  );
};
