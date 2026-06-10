import { useState, useEffect, useRef, useCallback } from 'react';
import { storesApi, pincodesApi } from '../services/api';
import { Loader } from '@googlemaps/js-api-loader';
import toast from 'react-hot-toast';
import {
  MapPin, Search, RefreshCw, Store, Navigation2,
  ChevronDown, Copy, Download, Hash, Compass, Layers,
  ArrowUpRight, ArrowDownRight, X, Filter
} from 'lucide-react';
import HyperlocalBadge from '../components/HyperlocalBadge';
import Logo from '../components/Logo';

const RANGES = [5, 10, 12, 15, 20];

const ZONES = [
  { key: 'z0', label: '< 5 km',    min: 0,  max: 5,  hex: '#10b981', fill: '#d1fae5', txtHex: '#065f46', badge: 'bg-emerald-100 text-emerald-800', chip: 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100' },
  { key: 'z1', label: '5 – 10 km', min: 5,  max: 10, hex: '#3b82f6', fill: '#dbeafe', txtHex: '#1e40af', badge: 'bg-blue-100 text-blue-800',    chip: 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100' },
  { key: 'z2', label: '10–15 km',  min: 10, max: 15, hex: '#f59e0b', fill: '#fef3c7', txtHex: '#92400e', badge: 'bg-amber-100 text-amber-800',   chip: 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100' },
  { key: 'z3', label: '15–20 km',  min: 15, max: 99, hex: '#f97316', fill: '#ffedd5', txtHex: '#9a3412', badge: 'bg-orange-100 text-orange-800',  chip: 'bg-orange-50 border-orange-200 text-orange-900 hover:bg-orange-100' },
];

function getZone(d) { return ZONES.find(z => d <= z.max) || ZONES[ZONES.length - 1]; }

const MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#f1f5f9' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#f1f5f9' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#64748b' }] },
  { featureType: 'road',                elementType: 'geometry',        stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial',       elementType: 'geometry',        stylers: [{ color: '#f8fafc' }] },
  { featureType: 'road.highway',        elementType: 'geometry',        stylers: [{ color: '#e2e8f0' }] },
  { featureType: 'road.highway',        elementType: 'geometry.stroke', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'water',               elementType: 'geometry',        stylers: [{ color: '#bfdbfe' }] },
  { featureType: 'poi.park',            elementType: 'geometry',        stylers: [{ color: '#dcfce7' }] },
  { featureType: 'poi',                 elementType: 'labels',          stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',                                             stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative',      elementType: 'geometry.stroke', stylers: [{ color: '#cbd5e1' }] },
];

function StoreIcon() {
  return (
    <svg viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="44">
      <path d="M18 0C8.06 0 0 8.06 0 18C0 30.5 18 44 18 44C18 44 36 30.5 36 18C36 8.06 27.94 0 18 0Z" fill="#E63946"/>
      <circle cx="18" cy="18" r="11" fill="white"/>
      <path d="M13 14h10l-1.5 7h-7L13 14zm0 0L12 12h-2M17 21v3M15 21v3M19 21v3M13 14h10" stroke="#E63946" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function Dashboard() {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [range, setRange] = useState(10);
  const [pincodes, setPincodes] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const storeSearchRef = useRef(null);
  const [activeZone, setActiveZone] = useState('all');
  const [pinFilter, setPinFilter] = useState('');
  const [highlighted, setHighlighted] = useState(null);
  const [searchMeta, setSearchMeta] = useState(null);
  const [excludedPincodes, setExcludedPincodes] = useState([]);
  const [showExcludedPanel, setShowExcludedPanel] = useState(false);
  const [pendingStoreSwitch, setPendingStoreSwitch] = useState(null);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const storeMarkerRef = useRef(null);
  const circleRef = useRef(null);
  const pincodeMarkersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const loaderRef = useRef(null);
  const searchAbortRef = useRef(null);
  const notifyCacheRef = useRef(false);
  const markerRetryRef = useRef(null);
  const hasResults = pincodes.length > 0;

  useEffect(() => { loadStores(); }, []);

  const loadStores = async () => {
    try {
      const { data } = await storesApi.getAll();
      setStores(data);
      if (data.length > 0) setSelectedStore(data[0]);
    } catch { toast.error('Failed to load stores'); }
    finally { setLoadingStores(false); }
  };

  // ── Map init ──────────────────────────────────────────────
  const initMap = useCallback(async (store) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
    if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') return;
    if (!mapRef.current) return;

    try {
      if (!loaderRef.current) {
        loaderRef.current = new Loader({ apiKey, version: 'weekly' });
        await loaderRef.current.load();
      }

      const lat = parseFloat(store.latitude);
      const lng = parseFloat(store.longitude);
      const center = { lat, lng };

      // Create or update map
      if (!mapInstance.current) {
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center, zoom: 13,
          styles: MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
          fullscreenControl: true,
          fullscreenControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
          clickableIcons: false,
        });
      } else {
        mapInstance.current.setCenter(center);
        mapInstance.current.setZoom(13);
      }

      // InfoWindow (shared)
      if (!infoWindowRef.current) {
        infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 220 });
      }

      // Store marker
      if (storeMarkerRef.current) storeMarkerRef.current.setMap(null);

      const svgUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 0C8.06 0 0 8.06 0 18C0 30.5 18 44 18 44C18 44 36 30.5 36 18C36 8.06 27.94 0 18 0Z" fill="#E63946"/>
          <circle cx="18" cy="18" r="11" fill="white"/>
          <path d="M13 14h10l-1.5 7h-7L13 14zm-1 0L11 12h-2" stroke="#E63946" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `);

      storeMarkerRef.current = new google.maps.Marker({
        position: center, map: mapInstance.current,
        title: store.store_name,
        icon: { url: svgUrl, scaledSize: new google.maps.Size(36, 44), anchor: new google.maps.Point(18, 44) },
        zIndex: 9999,
      });

      storeMarkerRef.current.addListener('click', () => {
        infoWindowRef.current.setContent(`
          <div style="font-family:-apple-system,sans-serif;padding:6px 2px">
            <div style="font-weight:700;font-size:14px;color:#111827;margin-bottom:2px">${store.store_name}</div>
            <div style="color:#6b7280;font-size:12px">${store.address || ''}</div>
            <div style="color:#9ca3af;font-size:11px;margin-top:4px">📍 ${store.pincode || ''}</div>
          </div>
        `);
        infoWindowRef.current.open(mapInstance.current, storeMarkerRef.current);
      });

      // Radius circle
      if (circleRef.current) circleRef.current.setMap(null);
      circleRef.current = new google.maps.Circle({
        strokeColor: '#E63946', strokeOpacity: 0.5, strokeWeight: 1.5,
        strokeDashArray: [4, 4],
        fillColor: '#E63946', fillOpacity: 0.05,
        map: mapInstance.current, center, radius: range * 1000,
      });

    } catch (err) { console.error('Map error:', err); }
  }, [range]);

  useEffect(() => {
    if (selectedStore && mapRef.current) initMap(selectedStore);
  }, [selectedStore, initMap]);

  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(range * 1000);
  }, [range]);

  // ── Place pincode markers on map ────────────────────────────
  const placePincodeMarkers = useCallback((pins) => {
    pincodeMarkersRef.current.forEach(m => m.setMap(null));
    pincodeMarkersRef.current = [];
    if (!mapInstance.current || !infoWindowRef.current) return;

    const bounds = new google.maps.LatLngBounds();
    if (storeMarkerRef.current) bounds.extend(storeMarkerRef.current.getPosition());

    pins.forEach(p => {
      if (!p.lat || !p.lon) return;
      const zone = getZone(p.distance);
      const pos = { lat: p.lat, lng: p.lon };
      bounds.extend(pos);

      const marker = new google.maps.Marker({
        position: pos, map: mapInstance.current, title: p.pincode,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: zone.hex, fillOpacity: 0.9,
          strokeColor: '#ffffff', strokeWeight: 1.5,
        },
        zIndex: 500,
      });

      marker.addListener('click', () => {
        infoWindowRef.current.setContent(`
          <div style="font-family:-apple-system,sans-serif;padding:6px 2px;min-width:140px">
            <div style="font-weight:700;font-size:15px;color:#111827;font-family:monospace">${p.pincode}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
              <span style="background:${zone.fill};color:${zone.txtHex};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${p.distance} km</span>
            </div>
            ${p.name ? `<div style="color:#6b7280;font-size:12px;margin-top:4px">${p.name}</div>` : ''}
            ${p.city ? `<div style="color:#9ca3af;font-size:11px;margin-top:2px">${p.city}${p.state ? ', ' + p.state : ''}</div>` : ''}
          </div>
        `);
        infoWindowRef.current.open(mapInstance.current, marker);
        setHighlighted(p.pincode);
      });

      pincodeMarkersRef.current.push(marker);
    });

    if (!bounds.isEmpty()) {
      mapInstance.current.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });
    }
  }, []);

  const schedulePincodeMarkers = useCallback((pins) => {
    if (markerRetryRef.current) clearInterval(markerRetryRef.current);
    pincodeMarkersRef.current.forEach(m => m.setMap(null));
    pincodeMarkersRef.current = [];

    if (!pins.length) return;

    let attempts = 0;
    const tryPlace = () => {
      if (mapInstance.current && infoWindowRef.current) {
        placePincodeMarkers(pins);
        return true;
      }
      return false;
    };

    if (tryPlace()) return;

    markerRetryRef.current = setInterval(() => {
      if (tryPlace() || ++attempts > 25) {
        clearInterval(markerRetryRef.current);
        markerRetryRef.current = null;
      }
    }, 200);
  }, [placePincodeMarkers]);

  const applySearchResults = useCallback((data, { silent = false, storeName } = {}) => {
    setPincodes(data.pincodes);
    setExcludedPincodes(data.excluded_pincodes || []);
    setShowExcludedPanel(false);
    setSearchMeta({
      total_found: data.total_found,
      excluded: data.excluded,
      shiprocket_master_count: data.shiprocket_master_count,
      cached: data.cached,
      cached_at: data.cached_at,
    });
    schedulePincodeMarkers(data.pincodes);

    if (silent) return;
    if (data.stale_fallback) {
      toast('OpenStreetMap unavailable — showing last cached results', { icon: '⚠️' });
    } else if (data.cached) {
      const label = storeName || 'this store';
      toast.success(`Showing ${data.pincodes.length} cached pincodes for ${label} (${range} km)`);
    } else if (data.pincodes.length === 0) {
      const msg = data.total_found > 0
        ? `Found ${data.total_found} pincodes, but none are Shiprocket serviceable`
        : 'No pincodes found in this range';
      toast(msg, { icon: '📭' });
    } else {
      const excluded = data.excluded ? ` (${data.excluded} non-serviceable hidden)` : '';
      toast.success(`Found ${data.pincodes.length} Shiprocket serviceable pincodes${excluded}`);
    }
  }, [schedulePincodeMarkers, range]);

  const loadCachedResults = useCallback(async (store, km, { notify = false } = {}) => {
    if (!store) return;
    try {
      const { data } = await pincodesApi.getNearby(store.id, km, { cacheOnly: true });
      if (data.pincodes?.length > 0) {
        setActiveZone('all');
        setPinFilter('');
        setHighlighted(null);
        applySearchResults(data, { silent: !notify, storeName: store.store_name });
      } else {
        setPincodes([]);
        setExcludedPincodes([]);
        setSearchMeta(null);
        setShowExcludedPanel(false);
        pincodeMarkersRef.current.forEach(m => m.setMap(null));
        pincodeMarkersRef.current = [];
      }
    } catch { /* no cache */ }
  }, [applySearchResults]);

  useEffect(() => {
    searchAbortRef.current?.abort();
    setSearching(false);

    if (!selectedStore) return;

    const notify = notifyCacheRef.current;
    notifyCacheRef.current = false;
    loadCachedResults(selectedStore, range, { notify });

    return () => {
      if (markerRetryRef.current) {
        clearInterval(markerRetryRef.current);
        markerRetryRef.current = null;
      }
    };
  }, [selectedStore?.id, range, loadCachedResults]);

  const requestStoreSwitch = (store) => {
    if (store.id === selectedStore?.id) {
      setStoreOpen(false);
      return;
    }
    setPendingStoreSwitch(store);
    setStoreOpen(false);
  };

  const confirmStoreSwitch = () => {
    if (!pendingStoreSwitch) return;
    searchAbortRef.current?.abort();
    setSearching(false);
    notifyCacheRef.current = true;
    setSelectedStore(pendingStoreSwitch);
    setPendingStoreSwitch(null);
  };

  const cancelStoreSwitch = () => setPendingStoreSwitch(null);

  // ── Search ─────────────────────────────────────────────────
  const handleSearch = async (refresh = false) => {
    if (!selectedStore) { toast.error('Select a store first'); return; }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearching(true);
    setActiveZone('all');
    setPinFilter('');
    setHighlighted(null);

    try {
      const { data } = await pincodesApi.getNearby(selectedStore.id, range, {
        refresh,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      applySearchResults(data);
    } catch (err) {
      if (controller.signal.aborted || err.code === 'ERR_CANCELED') return;
      const msg = err.code === 'ECONNABORTED'
        ? 'Search timed out — try again or use a smaller range'
        : (err.response?.data?.error || 'Search failed. Try again.');
      toast.error(msg);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(pincodes.map(p => p.pincode).join(', '));
    toast.success('Pincodes copied!');
  };

  const downloadCSV = () => {
    const rows = [['Pincode', 'Distance (km)', 'Name', 'City', 'State']];
    pincodes.forEach(p => rows.push([p.pincode, p.distance, p.name || '', p.city || '', p.state || '']));
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `${selectedStore?.store_name}_${range}km_pincodes.csv`
    });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const copyExcluded = () => {
    navigator.clipboard.writeText(excludedPincodes.map(p => p.pincode).join(', '));
    toast.success('Hidden pincodes copied!');
  };

  const downloadExcludedCSV = () => {
    const rows = [['Pincode', 'Distance (km)', 'Name', 'City', 'State', 'Shiprocket']];
    excludedPincodes.forEach(p => rows.push([p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'No']));
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `${selectedStore?.store_name}_${range}km_hidden_pincodes.csv`
    });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const filteredExcluded = excludedPincodes.filter(p => {
    const textMatch = !pinFilter || p.pincode.includes(pinFilter) || (p.name || '').toLowerCase().includes(pinFilter.toLowerCase());
    return textMatch;
  });

  // ── Derived data ───────────────────────────────────────────
  const zoneCounts = ZONES.map(z => ({
    ...z, count: pincodes.filter(p => getZone(p.distance).key === z.key).length
  }));

  const filtered = pincodes.filter(p => {
    const zoneMatch = activeZone === 'all' || getZone(p.distance).key === activeZone;
    const textMatch = !pinFilter || p.pincode.includes(pinFilter) || (p.name || '').toLowerCase().includes(pinFilter.toLowerCase());
    return zoneMatch && textMatch;
  });

  const grouped = ZONES.map(z => ({
    ...z,
    items: filtered.filter(p => getZone(p.distance).key === z.key)
  })).filter(g => g.items.length > 0);

  const nearest = pincodes[0];
  const farthest = pincodes[pincodes.length - 1];

  const hasKey = !!(import.meta.env.VITE_GOOGLE_MAPS_KEY && import.meta.env.VITE_GOOGLE_MAPS_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY');

  return (
    <div className="h-full flex flex-col bg-gray-50">

      {showExcludedPanel && excludedPincodes.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Filter className="w-5 h-5 text-amber-600" />
                  Hidden pincodes (not in Shiprocket)
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {excludedPincodes.length} pincodes found in range but not in Shiprocket master list
                </p>
              </div>
              <button onClick={() => setShowExcludedPanel(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
              <button onClick={copyExcluded} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium">
                <Copy className="w-3 h-3" />Copy all
              </button>
              <button onClick={downloadExcludedCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium">
                <Download className="w-3 h-3" />Export CSV
              </button>
              <span className="ml-auto text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full font-medium">
                Not serviceable via Shiprocket
              </span>
            </div>

            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Pincode', 'Distance', 'Area', 'City', 'State'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredExcluded.map((p, i) => {
                    const z = getZone(p.distance);
                    return (
                      <tr key={p.pincode} className={i % 2 === 0 ? 'bg-white' : 'bg-amber-50/30'}>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-900">{p.pincode}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-md text-xs font-semibold ${z.badge}`}>{p.distance} km</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-[140px] truncate">{p.name || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{p.city || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{p.state || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredExcluded.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">No hidden pincodes match your filter</p>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingStoreSwitch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Switch store?</h3>
            <p className="text-sm text-gray-600 mt-2">
              Switch from <span className="font-medium">{selectedStore?.store_name}</span> to{' '}
              <span className="font-medium text-tss-red">{pendingStoreSwitch.store_name}</span>?
            </p>
            {hasResults && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                Current pincode results will be cleared.
              </p>
            )}
            <p className="text-xs text-gray-400 mt-3">
              If you previously searched this store at {range} km, cached pincodes will load automatically.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={cancelStoreSwitch} className="btn-secondary">Cancel</button>
              <button type="button" onClick={confirmStoreSwitch} className="btn-primary">Switch store</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">

          {/* Store selector */}
          <div className="relative">
            <button
              onClick={() => { setStoreOpen(o => { if (!o) { setStoreSearch(''); setTimeout(() => storeSearchRef.current?.focus(), 50); } return !o; }); }}
              disabled={loadingStores}
              className="flex items-center gap-2.5 pl-3 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:border-gray-300 transition-all shadow-sm min-w-[220px]"
            >
              <Logo size={28} className="rounded-lg" />
              <span className="flex-1 text-left truncate text-gray-700">
                {loadingStores ? 'Loading…' : selectedStore?.store_name || 'Select store'}
              </span>
              {selectedStore && (
                <span className="text-xs text-gray-400 font-normal flex-shrink-0">{selectedStore.city_name}</span>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${storeOpen ? 'rotate-180' : ''}`} />
            </button>

            {storeOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setStoreOpen(false)} />
                <div className="absolute z-50 top-full mt-2 left-0 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        ref={storeSearchRef}
                        type="text"
                        placeholder="Search stores…"
                        value={storeSearch}
                        onChange={e => setStoreSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setStoreOpen(false)}
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tss-red/20 focus:border-tss-red/40"
                      />
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {(() => {
                      const q = storeSearch.trim().toLowerCase();
                      const list = q
                        ? stores.filter(s =>
                            s.store_name.toLowerCase().includes(q) ||
                            s.city_name?.toLowerCase().includes(q) ||
                            s.pincode?.includes(q)
                          )
                        : stores;
                      if (list.length === 0) return (
                        <p className="text-center text-xs text-gray-400 py-6">No stores match "{storeSearch}"</p>
                      );
                      return list.map(store => (
                        <button
                          key={store.id}
                          onClick={() => { requestStoreSwitch(store); setStoreSearch(''); }}
                          className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center gap-3 ${selectedStore?.id === store.id ? 'bg-red-50' : ''}`}
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${store.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`font-medium truncate ${selectedStore?.id === store.id ? 'text-tss-red' : 'text-gray-800'}`}>{store.store_name}</p>
                              {!!store.is_hyperlocal && <HyperlocalBadge className="flex-shrink-0" />}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{store.city_name} · {store.pincode}</p>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Range pills */}
          <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => { setRange(r); if (circleRef.current) circleRef.current.setRadius(r * 1000); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  range === r
                    ? 'bg-white text-tss-red shadow-sm ring-1 ring-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {r} km
              </button>
            ))}
          </div>

          {/* Search */}
          <button
            onClick={() => handleSearch(false)}
            disabled={searching || !selectedStore}
            className="flex items-center gap-2 px-5 py-2.5 bg-tss-red text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm shadow-red-200"
          >
            {searching
              ? <><RefreshCw className="w-4 h-4 animate-spin" />Fetching (~20s)…</>
              : <><Search className="w-4 h-4" />Search Pincodes</>}
          </button>
          {hasResults && (
            <button
              onClick={() => handleSearch(true)}
              disabled={searching || !selectedStore}
              title="Re-fetch from OpenStreetMap (bypass cache)"
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />Re-fetch
            </button>
          )}

          {/* Store meta */}
          {selectedStore && (
            <div className="ml-auto flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <Navigation2 className="w-3 h-3" />
                {parseFloat(selectedStore.latitude).toFixed(5)}, {parseFloat(selectedStore.longitude).toFixed(5)}
              </span>
              {!!selectedStore.is_hyperlocal && <HyperlocalBadge />}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${selectedStore.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${selectedStore.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                {selectedStore.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats bar (after results) ─────────────────────────── */}
      {hasResults && (
        <div className="bg-white border-b border-gray-100 px-6 py-3 flex-shrink-0">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-tss-red/10 rounded-lg flex items-center justify-center">
                <Hash className="w-4 h-4 text-tss-red" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Shiprocket Serviceable</p>
                <p className="text-lg font-bold text-gray-900 leading-tight">{pincodes.length}</p>
              </div>
            </div>

            {searchMeta?.cached && (
              <>
                <div className="w-px h-8 bg-gray-100" />
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
                  <RefreshCw className="w-3 h-3" />
                  Cached{searchMeta.cached_at ? ` · ${new Date(searchMeta.cached_at).toLocaleDateString()}` : ''}
                </span>
              </>
            )}

            {searchMeta?.excluded > 0 && (
              <>
                <div className="w-px h-8 bg-gray-100" />
                <button
                  type="button"
                  onClick={() => {
                    if (excludedPincodes.length > 0) setShowExcludedPanel(true);
                    else toast('Click Re-fetch to load hidden pincode details', { icon: 'ℹ️' });
                  }}
                  title="View hidden pincodes"
                  className="flex items-center gap-2 rounded-xl px-2 py-1 -mx-2 hover:bg-amber-50 transition-colors group"
                >
                  <div className="w-8 h-8 bg-amber-50 group-hover:bg-amber-100 rounded-lg flex items-center justify-center">
                    <Filter className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-gray-400 group-hover:text-amber-700">Hidden (not in Shiprocket)</p>
                    <p className="text-lg font-bold text-amber-700 leading-tight">
                      {excludedPincodes.length || searchMeta.excluded}
                      <span className="text-xs font-normal text-amber-600/70 ml-1.5">click to view</span>
                    </p>
                  </div>
                </button>
              </>
            )}

            <div className="w-px h-8 bg-gray-100" />

            {nearest && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
                  <ArrowDownRight className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Nearest</p>
                  <p className="text-sm font-bold text-gray-900 leading-tight font-mono">{nearest.pincode} <span className="font-normal text-gray-400">{nearest.distance}km</span></p>
                </div>
              </div>
            )}

            {farthest && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Farthest</p>
                  <p className="text-sm font-bold text-gray-900 leading-tight font-mono">{farthest.pincode} <span className="font-normal text-gray-400">{farthest.distance}km</span></p>
                </div>
              </div>
            )}

            <div className="w-px h-8 bg-gray-100" />

            {/* Zone breakdown bars */}
            <div className="flex items-center gap-3 flex-wrap">
              {zoneCounts.filter(z => z.count > 0).map(z => (
                <button
                  key={z.key}
                  onClick={() => setActiveZone(activeZone === z.key ? 'all' : z.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium ${
                    activeZone === z.key ? `${z.badge} border-transparent ring-2 ring-offset-1` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: z.hex }} />
                  {z.label}
                  <span className="font-bold">{z.count}</span>
                </button>
              ))}
              {activeZone !== 'all' && (
                <button onClick={() => setActiveZone('all')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />Clear
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={copyAll} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors">
                <Copy className="w-3 h-3" />Copy All
              </button>
              <button onClick={downloadCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors">
                <Download className="w-3 h-3" />CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main split view ───────────────────────────────────── */}
      <div className={`flex-1 flex overflow-hidden ${!hasResults ? 'flex-col' : ''}`}>

        {/* Map panel */}
        <div className={`relative flex-shrink-0 ${hasResults ? 'w-[58%]' : 'w-full flex-1'}`}>
          {hasKey ? (
            <div ref={mapRef} className="absolute inset-0" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100">
              <Compass className="w-16 h-16 text-gray-300 mb-3" />
              <p className="font-semibold text-gray-500">No Google Maps API key</p>
              <p className="text-sm text-gray-400 mt-1">Add <code className="bg-white px-1 rounded">VITE_GOOGLE_MAPS_KEY</code> to frontend/.env</p>
            </div>
          )}

          {/* Map overlay: searching spinner */}
          {searching && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
              <div className="w-12 h-12 border-4 border-tss-red border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-600">Searching pincodes…</p>
            </div>
          )}

          {/* Map legend (when results) */}
          {hasResults && (
            <div className="absolute bottom-6 left-4 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-100 px-3 py-3 z-10">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Layers className="w-3 h-3" />Distance Zones
              </p>
              {zoneCounts.filter(z => z.count > 0).map(z => (
                <div key={z.key} className="flex items-center gap-2 py-0.5">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: z.hex }} />
                  <span className="text-xs text-gray-600 w-20">{z.label}</span>
                  <span className="text-xs font-semibold text-gray-800">{z.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* No results prompt */}
          {!hasResults && !searching && selectedStore && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-100 px-5 py-3 flex items-center gap-3 z-10">
              <div className="w-8 h-8 bg-tss-red/10 rounded-lg flex items-center justify-center">
                <Search className="w-4 h-4 text-tss-red" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Ready to search</p>
                <p className="text-xs text-gray-400">Select range and click Search Pincodes</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Results panel ────────────────────────────────────── */}
        {hasResults && (
          <div className="flex-1 flex flex-col overflow-hidden border-l border-gray-100 bg-white">

            {/* Search within */}
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter by pincode or area…"
                  value={pinFilter}
                  onChange={e => setPinFilter(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tss-red/20 focus:border-tss-red/40"
                />
                {pinFilter && (
                  <button onClick={() => setPinFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Pincode chips grouped by zone */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MapPin className="w-10 h-10 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">No pincodes match your filter</p>
                </div>
              ) : grouped.map(zone => (
                <div key={zone.key}>
                  {/* Zone header */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: zone.hex }} />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{zone.label}</span>
                    <span className="ml-auto text-xs font-semibold text-gray-400">{zone.items.length} pincodes</span>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(zone.items.length / pincodes.length) * 100}%`, background: zone.hex }}
                      />
                    </div>
                  </div>

                  {/* Chips */}
                  <div className="flex flex-wrap gap-2">
                    {zone.items.map(p => (
                      <button
                        key={p.pincode}
                        onClick={() => {
                          setHighlighted(p.pincode);
                          const marker = pincodeMarkersRef.current.find(m => m.getTitle() === p.pincode);
                          if (marker && mapInstance.current) {
                            mapInstance.current.panTo(marker.getPosition());
                            google.maps.event.trigger(marker, 'click');
                          }
                        }}
                        className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${zone.chip} ${highlighted === p.pincode ? 'ring-2 shadow-sm' : ''}`}
                        title={p.name || p.city || ''}
                      >
                        <span className="font-mono font-bold tracking-wide">{p.pincode}</span>
                        <span className="text-gray-400 font-normal">{p.distance}km</span>
                        {p.name && (
                          <span className="hidden group-hover:inline text-gray-400 border-l border-current/20 pl-1.5 max-w-[80px] truncate">{p.name}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Table footer */}
            <div className="border-t border-gray-100 flex-shrink-0">
              <details className="group">
                <summary className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer flex items-center justify-between hover:bg-gray-50 select-none list-none">
                  <span>Detailed Table ({filtered.length} rows)</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 border-t border-gray-100">
                      <tr>
                        {['Pincode', 'Dist', 'Area', 'City', 'State'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p, i) => {
                        const z = getZone(p.distance);
                        return (
                          <tr key={p.pincode} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-100/50 transition-colors cursor-pointer ${highlighted === p.pincode ? 'bg-yellow-50' : ''}`}
                            onClick={() => setHighlighted(p.pincode)}>
                            <td className="px-3 py-2 font-mono font-bold text-gray-900">{p.pincode}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold ${z.badge}`}>{p.distance}km</span>
                            </td>
                            <td className="px-3 py-2 text-gray-500 max-w-[100px] truncate">{p.name || '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{p.city || '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{p.state || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </div>
        )}

        {/* Loading state (first search) */}
        {searching && !hasResults && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-white/80">
            <div className="w-10 h-10 border-4 border-tss-red border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Fetching pincodes via OpenStreetMap…</p>
          </div>
        )}
      </div>
    </div>
  );
}
