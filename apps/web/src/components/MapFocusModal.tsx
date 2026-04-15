import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { X, Maximize2 } from 'lucide-react';
import type { SchoolSummary } from '@optima/shared';

const DEFAULT_CENTER: [number, number] = [1.3521, 103.8198];

interface MapFocusModalProps {
  isOpen: boolean;
  onClose: () => void;
  schools: SchoolSummary[];
  center?: [number, number];
  loading?: boolean;
}

export function MapFocusModal({ isOpen, onClose, schools, center, loading }: MapFocusModalProps) {
  const navigate = useNavigate();

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const mapPins = schools.filter((s) => s.lat && s.lng);
  const mapCenter: [number, number] =
    center ?? (mapPins.length > 0 ? [mapPins[0].lat!, mapPins[0].lng!] : DEFAULT_CENTER);

  return (
    // Backdrop — clicking here closes the modal
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      {/* Dim + blur layer */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal panel */}
      <div
        className="relative w-full max-w-[1600px] rounded-2xl overflow-hidden shadow-2xl"
        style={{ height: '82vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close map"
          className="absolute top-3 right-3 z-[10000] flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-700 rounded-full px-3 py-1.5 text-[13px] font-semibold shadow-md transition-colors"
        >
          <X size={14} />
          Close
        </button>

        {/* School count badge */}
        <div className="absolute top-3 left-3 z-[10000] bg-white/90 text-gray-700 rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-md">
          {loading ? 'Loading…' : `${mapPins.length} school${mapPins.length !== 1 ? 's' : ''}`}
        </div>

        {/* Map */}
        <MapContainer
          center={mapCenter}
          zoom={12}
          scrollWheelZoom
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OSM</a>'
          />
          {mapPins.map((school) => (
            <Marker key={school.id} position={[school.lat!, school.lng!]}>
              <Popup>
                <div className="min-w-[150px]">
                  <p className="font-semibold text-dark text-[13px] leading-snug">{school.name}</p>
                  {school.address && (
                    <p className="text-muted text-[11px] mt-0.5">{school.address}</p>
                  )}
                  <button
                    className="mt-2 text-sky-700 text-[12px] font-semibold hover:underline"
                    onClick={() => navigate(`/app/schools/${school.id}`)}
                  >
                    View profile →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

/** Small button to trigger focus mode — place it as an overlay on a map container */
export function ExpandMapButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Expand map"
      className="absolute bottom-3 right-3 z-[400] flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-700 rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-md transition-colors border border-gray-200/80"
    >
      <Maximize2 size={12} />
      Expand
    </button>
  );
}
