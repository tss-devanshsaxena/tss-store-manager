import { useState, useRef } from 'react';
import { pincodesApi } from '../services/api';
import {
  X, Search, Download, RefreshCw, CheckCircle,
  AlertCircle, MapPin, RotateCcw, Database,
} from 'lucide-react';
import toast from 'react-hot-toast';
import HyperlocalBadge from './HyperlocalBadge';
import { downloadExcel } from '../utils/exportExcel';

const RANGES = [5, 10, 12, 15, 20];

export default function RegionalSearch({ stores, onClose }) {
  const [selectedCity, setSelectedCity] = useState('');
  const [range, setRange] = useState(10);
  const [results, setResults] = useState({});
  const [fetching, setFetching] = useState(false);
  const abortRef = useRef(null);

  const cities = [...new Set(stores.map(s => s.city_name).filter(Boolean))].sort();
  const regionalStores = selectedCity ? stores.filter(s => s.city_name === selectedCity) : [];

  const patch = (storeId, data) =>
    setResults(prev => ({ ...prev, [storeId]: { ...prev[storeId], ...data } }));

  const abortAndReset = () => {
    abortRef.current?.abort();
    setFetching(false);
    setResults({});
  };

  const handleFetch = async () => {
    if (!selectedCity || !regionalStores.length) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Mark all as loading upfront so the list renders immediately
    const initial = {};
    regionalStores.forEach(s => { initial[s.id] = { loading: true }; });
    setResults(initial);
    setFetching(true);

    // Pass 1 — parallel cache-only (hits the DB, no OSM calls, instant)
    const hasCacheSet = new Set();
    await Promise.all(regionalStores.map(async (store) => {
      try {
        const { data } = await pincodesApi.getNearby(store.id, range, { cacheOnly: true });
        if (data.cached) {
          hasCacheSet.add(store.id);
          patch(store.id, {
            pincodes: data.pincodes,
            excluded: data.excluded_pincodes || [],
            loading: false,
            fromDb: true,
            cached_at: data.cached_at || null,
            error: null,
          });
        } else {
          patch(store.id, { loading: false, pincodes: null });
        }
      } catch {
        patch(store.id, { loading: false, pincodes: null });
      }
    }));

    if (ctrl.signal.aborted) { setFetching(false); return; }

    // Pass 2 — sequential OSM fetch for stores without a DB cache
    const toFetch = regionalStores.filter(s => !hasCacheSet.has(s.id));
    for (const store of toFetch) {
      if (ctrl.signal.aborted) break;
      patch(store.id, { loading: true });
      try {
        const { data } = await pincodesApi.getNearby(store.id, range, { signal: ctrl.signal });
        if (ctrl.signal.aborted) break;
        patch(store.id, {
          pincodes: data.pincodes || [],
          excluded: data.excluded_pincodes || [],
          loading: false,
          fromDb: false,
          cached_at: null,
          error: null,
        });
      } catch (err) {
        if (ctrl.signal.aborted || err.code === 'ERR_CANCELED') break;
        patch(store.id, { loading: false, error: 'Fetch failed', pincodes: [] });
      }
    }

    if (!ctrl.signal.aborted) setFetching(false);
  };

  // Force re-fetch a single store (bypass cache, hit OSM fresh)
  const refetchStore = async (store) => {
    patch(store.id, { loading: true, error: null });
    try {
      const { data } = await pincodesApi.getNearby(store.id, range, { refresh: true });
      patch(store.id, {
        pincodes: data.pincodes || [],
        excluded: data.excluded_pincodes || [],
        loading: false,
        fromDb: false,
        cached_at: null,
        error: null,
      });
    } catch (err) {
      patch(store.id, { loading: false, error: 'Re-fetch failed' });
      toast.error(`Re-fetch failed for ${store.store_name}`);
    }
  };

  const exportStoreExcel = (store) => {
    const r = results[store.id];
    if (!r?.pincodes) return;
    const rows = [['Pincode', 'Distance (km)', 'Name', 'City', 'State', 'Serviceable']];
    r.pincodes.forEach(p => rows.push([p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'Yes']));
    (r.excluded || []).forEach(p => rows.push([p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'No']));
    downloadExcel(rows, `${store.store_name}_${range}km_pincodes.xlsx`);
  };

  const exportAllExcel = () => {
    const rows = [['Store', 'Pincode', 'Distance (km)', 'Name', 'City', 'State', 'Serviceable']];
    regionalStores.forEach(store => {
      const r = results[store.id];
      if (!r?.pincodes) return;
      r.pincodes.forEach(p => rows.push([store.store_name, p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'Yes']));
      (r.excluded || []).forEach(p => rows.push([store.store_name, p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'No']));
    });
    if (rows.length === 1) { toast.error('No results to export yet'); return; }
    downloadExcel(rows, `${selectedCity}_${range}km_regional_pincodes.xlsx`);
  };

  const loadedCount = regionalStores.filter(s => {
    const r = results[s.id];
    return r && !r.loading && r.pincodes !== null && r.pincodes !== undefined;
  }).length;

  const totalServiceable = regionalStores.reduce(
    (sum, s) => sum + (results[s.id]?.pincodes?.length || 0), 0
  );
  const hasAnyResults = regionalStores.some(s => results[s.id]?.pincodes?.length > 0 || results[s.id]?.excluded?.length > 0);
  const allDone = regionalStores.length > 0 && loadedCount === regionalStores.length && !fetching;

  return (
    <div className="w-72 flex-shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50">
        <div>
          <p className="text-sm font-semibold text-gray-800">Regional Search</p>
          <p className="text-xs text-gray-400 mt-0.5">All stores in a city</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Controls */}
      <div className="px-3 py-3 border-b border-gray-100 space-y-2.5 flex-shrink-0">
        <select
          value={selectedCity}
          onChange={e => { abortAndReset(); setSelectedCity(e.target.value); }}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-tss-red/20 focus:border-tss-red/40"
        >
          <option value="">Select region…</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => { abortAndReset(); setRange(r); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                range === r ? 'bg-white text-tss-red shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {r}km
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {fetching ? (
            <button
              onClick={() => { abortRef.current?.abort(); setFetching(false); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />Stop
            </button>
          ) : (
            <button
              onClick={handleFetch}
              disabled={!selectedCity}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-tss-red text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              {selectedCity ? `Load ${regionalStores.length} store${regionalStores.length !== 1 ? 's' : ''}` : 'Select region'}
            </button>
          )}
          {hasAnyResults && (
            <button
              onClick={exportAllExcel}
              title="Export all stores as Excel"
              className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />All
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {selectedCity && regionalStores.length > 0 && Object.keys(results).length > 0 && (
        <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0 flex items-center gap-2">
          <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-tss-red rounded-full transition-all duration-300"
              style={{ width: `${(loadedCount / regionalStores.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap tabular-nums">
            {loadedCount}/{regionalStores.length}
            {allDone && totalServiceable > 0 && (
              <span className="ml-1 text-green-600 font-medium">· {totalServiceable.toLocaleString()}</span>
            )}
          </span>
        </div>
      )}

      {/* Store list */}
      <div className="flex-1 overflow-y-auto">
        {!selectedCity ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <MapPin className="w-10 h-10 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400 font-medium">Select a region</p>
            <p className="text-xs text-gray-300 mt-1">DB-cached stores load instantly · uncached fetch one by one</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {regionalStores.map(store => (
              <StoreCard
                key={store.id}
                store={store}
                result={results[store.id]}
                onExport={() => exportStoreExcel(store)}
                onRefetch={() => refetchStore(store)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function StoreCard({ store, result: r, onExport, onRefetch }) {
  return (
    <div className="px-3 py-3 hover:bg-gray-50/60 transition-colors">
      {/* Store name row */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-xs font-semibold text-gray-900 leading-tight">{store.store_name}</p>
            {!!store.is_hyperlocal && <HyperlocalBadge />}
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">{store.pincode || '—'}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {/* Re-fetch button — only shown when result exists */}
          {r && !r.loading && r.pincodes !== null && (
            <button
              onClick={onRefetch}
              title="Force fresh fetch from OpenStreetMap (bypasses DB cache)"
              className="text-gray-300 hover:text-tss-red transition-colors p-0.5"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <div className={`w-1.5 h-1.5 rounded-full ${store.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
        </div>
      </div>

      {/* Status */}
      {!r ? (
        <p className="text-xs text-gray-300 italic">Waiting…</p>
      ) : r.loading ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <RefreshCw className="w-3 h-3 animate-spin text-tss-red flex-shrink-0" />
          Fetching from OpenStreetMap…
        </div>
      ) : r.error ? (
        <div className="flex items-center gap-1 text-xs text-red-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{r.error}
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Counts */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs font-medium text-gray-700">
              <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
              {r.pincodes?.length || 0} serviceable
            </span>
            {r.excluded?.length > 0 && (
              <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                +{r.excluded.length} hidden
              </span>
            )}
          </div>

          {/* DB cache badge */}
          {r.fromDb && (
            <div className="flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-md px-2 py-1">
              <Database className="w-3 h-3 flex-shrink-0" />
              <span>Stored result{fmtDate(r.cached_at) ? ` · ${fmtDate(r.cached_at)}` : ''}</span>
            </div>
          )}

          {/* Export button */}
          {(r.pincodes?.length > 0 || r.excluded?.length > 0) && (
            <button
              onClick={onExport}
              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-md text-xs font-medium transition-colors"
            >
              <Download className="w-3 h-3" />Export Excel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
