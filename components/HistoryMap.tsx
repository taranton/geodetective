import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { SearchHistory } from '../types';

// Fix for default marker icons in React-Leaflet (use CDN URLs)
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom emerald marker
const createCustomIcon = (confidence: number | null) => {
  const color = confidence !== null
    ? confidence >= 70 ? '#10b981' : confidence >= 40 ? '#eab308' : '#ef4444'
    : '#6b7280';

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

// Component to fit bounds
const FitBounds: React.FC<{ locations: Array<[number, number]> }> = ({ locations }) => {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      if (locations.length === 1) {
        map.setView(locations[0], 10);
      } else {
        const bounds = L.latLngBounds(locations);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [locations, map]);

  return null;
};

interface HistoryMapProps {
  history: SearchHistory[];
  onSelectItem: (item: SearchHistory) => void;
}

const HistoryMap: React.FC<HistoryMapProps> = ({ history, onSelectItem }) => {
  // Filter items with coordinates
  const locationsWithCoords = history.filter(
    item => item.coordinates && item.coordinates.lat && item.coordinates.lng
  );

  const positions: Array<[number, number]> = locationsWithCoords.map(
    item => [item.coordinates!.lat, item.coordinates!.lng]
  );

  if (locationsWithCoords.length === 0) {
    return (
      <div className="h-[500px] bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-center text-slate-500">
        No locations with coordinates to display on map.
      </div>
    );
  }

  // Default center (world view)
  const defaultCenter: [number, number] = positions.length > 0
    ? positions[0]
    : [20, 0];

  return (
    <div className="h-[500px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
      <MapContainer
        center={defaultCenter}
        zoom={3}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds locations={positions} />

        {locationsWithCoords.map((item) => (
          <Marker
            key={item.id}
            position={[item.coordinates!.lat, item.coordinates!.lng]}
            icon={createCustomIcon(item.confidenceScore)}
            eventHandlers={{
              click: () => onSelectItem(item),
            }}
          >
            <Popup>
              <div className="text-slate-900 min-w-[200px]">
                <h3 className="font-bold text-sm mb-1">{item.locationName}</h3>
                <p className="text-xs text-slate-600 mb-2">
                  {new Date(item.timestamp).toLocaleDateString()}
                </p>
                {item.confidenceScore !== null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span>Confidence:</span>
                    <span className={`font-bold ${
                      item.confidenceScore >= 70 ? 'text-emerald-600' :
                      item.confidenceScore >= 40 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {item.confidenceScore}%
                    </span>
                  </div>
                )}
                <button
                  onClick={() => onSelectItem(item)}
                  className="mt-2 text-xs bg-emerald-600 text-white px-3 py-1 rounded hover:bg-emerald-500 transition-colors"
                >
                  View Details
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default HistoryMap;
