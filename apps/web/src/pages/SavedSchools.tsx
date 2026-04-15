import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Bookmark, MapPin, ChevronLeft, ChevronRight, BookmarkX } from 'lucide-react';
import { getSavedSchools, unsaveSchool } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/Button';
import type { SchoolSummary } from '@optima/shared';
import { MapFocusModal, ExpandMapButton } from '../components/MapFocusModal';

const PAGE_SIZE = 10;

export function SavedSchools() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);

  const { data: resp, isPending } = useQuery({
    queryKey: ['saved-schools', user?.id],
    queryFn: getSavedSchools,
    enabled: !!user,
  });

  const unsaveMutation = useMutation({
    mutationFn: unsaveSchool,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-schools', user?.id] });
    },
  });

  const schools: SchoolSummary[] = resp?.ok ? resp.data : [];
  const totalPages = Math.max(1, Math.ceil(schools.length / PAGE_SIZE));
  const pageSchools = schools.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mapSchools = schools.filter((s) => s.lat && s.lng);
  const center: [number, number] = mapSchools.length > 0
    ? [mapSchools[0].lat!, mapSchools[0].lng!]
    : [1.3521, 103.8198];

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />

      <div className="max-w-[1700px] mx-auto px-8 lg:px-16">

        {/* Header */}
        <div className="py-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[38px] font-extrabold text-dark tracking-[-0.03em] flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-navy flex items-center justify-center flex-shrink-0">
                <Bookmark size={17} className="text-white" />
              </div>
              Saved Schools
            </h1>
            <p className="text-[15px] text-muted mt-2">
              {isPending ? 'Loading…' : `${schools.length} school${schools.length !== 1 ? 's' : ''} saved`}
            </p>
          </div>
        </div>

        {isPending ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse h-28" />
            ))}
          </div>
        ) : schools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center pb-12">
            <div className="w-16 h-16 rounded-2xl bg-navy/8 border border-navy/12 flex items-center justify-center mb-5">
              <Bookmark size={24} className="text-navy/40" />
            </div>
            <h2 className="text-[22px] font-bold text-dark mb-2">No saved schools yet</h2>
            <p className="text-[15px] text-muted mb-8 max-w-[360px] leading-relaxed">
              Bookmark schools from search results or school profiles to see them here.
            </p>
            <Link to="/app/search">
              <Button>Browse Schools</Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-5 pb-12">

            {/* List */}
            <div className="flex-1 min-w-0">
              <div className="space-y-2.5">
                {pageSchools.map((school) => (
                  <div
                    key={school.id}
                    onClick={() => setSelectedId(school.id === selectedId ? null : school.id)}
                    className={`bg-white rounded-2xl border p-5 cursor-pointer transition-all hover:shadow-md ${
                      selectedId === school.id
                        ? 'border-sky-300 ring-1 ring-sky-300/30 shadow-sm'
                        : 'border-gray-200 hover:border-sky-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/app/schools/${school.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[16px] font-bold text-dark hover:text-navy transition-colors truncate block"
                        >
                          {school.name}
                        </Link>
                        {school.section && (
                          <span className="text-[12px] text-muted bg-surface px-2 py-0.5 rounded-full border border-gray-200 inline-block mt-1">
                            {school.section}
                          </span>
                        )}
                        {school.address && (
                          <p className="flex items-center gap-1.5 text-[13px] text-muted mt-2">
                            <MapPin size={12} className="flex-shrink-0" />
                            {school.address}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          unsaveMutation.mutate(school.id);
                        }}
                        title="Remove from saved"
                        className="p-2 rounded-xl text-muted hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                      >
                        <BookmarkX size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 px-1">
                  <p className="text-[13px] text-muted">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft size={16} />
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Map */}
            {mapSchools.length > 0 && (
              <div className="lg:w-[520px] flex-shrink-0">
                <div
                  className="sticky top-[84px] bg-white rounded-2xl border border-gray-200 overflow-hidden"
                  style={{ height: 560, boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}
                >
                  <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    {mapSchools.map((s) => (
                      <Marker key={s.id} position={[s.lat!, s.lng!]}>
                        <Popup>
                          <Link to={`/app/schools/${s.id}`} className="font-semibold text-sky-600 hover:underline">
                            {s.name}
                          </Link>
                          {s.address && <p className="text-xs text-gray-500 mt-0.5">{s.address}</p>}
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                  <ExpandMapButton onClick={() => setFocusOpen(true)} />
                </div>
              </div>
            )}

            <MapFocusModal
              isOpen={focusOpen}
              onClose={() => setFocusOpen(false)}
              schools={mapSchools}
              center={center}
            />
          </div>
        )}
      </div>
    </div>
  );
}
