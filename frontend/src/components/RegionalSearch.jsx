import { useState, useRef } from 'react';
import { pincodesApi } from '../services/api';
import { X, Search, Download, RefreshCw, CheckCircle, AlertCircle, MapPin } from 'lucide-react';
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

  const reset = () => {
    abortRef.current?.abort();
    setFetching(false);
    setResults({});
  };

  const handleFetch = async () => {
    if (!selectedCity || !regionalStores.length) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Mark all waiting
    const initial = {};
    regionalStores.forEach(s => { initial[s.id] = { loading: true }; });
    setResults(initial);
    setFetching(true);

    // Pass 1 — parallel cache-only (no OSM calls, instant)
    const hasCacheSet = new Set();
    await Promise.all(regionalStores.map(async (store) => {
      try {
        const { data } = await pincodesApi.getNearby(store.id, range, { cacheOnly: true });
        if (data.cached && data.pincodes?.length >= 0) {
          hasCacheSet.add(store.id);
          patch(store.id, {
            pincodes: data.pincodes,
            excluded: data.excluded_pincodes || [],
            loading: false,
            cached: true,
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

    // Pass 2 — sequential OSM fetch for uncached stores only
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
          cached: false,
          error: null,
        });
      } catch (err) {
        if (ctrl.signal.aborted || err.code === 'ERR_CANCELED') break;
        patch(store.id, { loading: false, error: 'Failed to fetch', pincodes: [] });
      }
    }

    if (!ctrl.signal.aborted) setFetching(false);
  };

  const handleCityChange = (city) => { reset(); setSelectedCity(city); };
  const handleRangeChange = (r) => { reset(); setRange(r); };

  const exportStoreCSV = (store) => {
    const r = results[store.id];
    if (!r?.pincodes) return;
    const rows = [['Pincode', 'Distance (km)', 'Name', 'City', 'State', 'Serviceable']];
    r.pincodes.forEach(p => rows.push([p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'Yes']));
    (r.excluded || []).forEach(p => rows.push([p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'No']));
    downloadExcel(rows, `${store.store_name}_${range}km_pincodes.xlsx`);
  };

  const exportAllCSV = () => {
    const rows = [['Store', 'Pincode', 'Distance (km)', 'Name', 'City', 'State', 'Serviceable']];
    regionalStores.forEach(store => {
      const r = results[store.id];
      if (!r?.pincodes) return;
      r.pincodes.forEach(p => rows.push([store.store_name, p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'Yes']));
      (r.excluded || []).forEach(p => rows.push([store.store_name, p.pincode, p.distance, p.name || '', p.city || '', p.state || '', 'No']));
    });
    if (rows.length === 1) { toast.error('No data to export yet'); return; }
    downloadExcel(rows, `${selectedCity}_${range}km_regional_pincodes.xlsx`);
  };

  const loadedCount = regionalStores.filter(s => {
    const r = results[s.id];
    return r && !r.loading && r.pincodes !== null && r.pincodes !== undefined;
  }).length;

  const totalServiceable = regionalStores.reduce((sum, s) => sum + (results[s.id]?.pincodes?.length || 0), 0);
  const hasAnyResults = totalServiceable > 0;
  const allLoaded = regionalStores.length > 0 && loadedCount === regionalStores.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Regional Search</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Fetch pincodes for all stores in a region — cached stores load instantly, rest queue one at a time
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-end gap-4 flex-wrap flex-shrink-0">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Region</label>
            <select
              value={selectedCity}
              onChange={e => handleCityChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-tss-red/20 focus:border-tss-red/40"
            >
              <option value="">Select region…</option>
              {cities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Range</label>
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1">
              {RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => handleRangeChange(r)}
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
          </div>

          <div className="flex items-center gap-2">
            {fetching ? (
              <button
                onClick={() => { abortRef.current?.abort(); setFetching(false); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />Stop
              </button>
            ) : (
              <button
                onClick={handleFetch}
                disabled={!selectedCity}
                className="flex items-center gap-2 px-5 py-2.5 bg-tss-red text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm shadow-red-200"
              >
                <Search className="w-4 h-4" />
                {selectedCity
                  ? `Load ${regionalStores.length} Store${regionalStores.length !== 1 ? 's' : ''}`
                  : 'Select Region First'}
              </button>
            )}
            {hasAnyResults && (
              <button
                onClick={exportAllCSV}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />Export All Excel
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {selectedCity && regionalStores.length > 0 && Object.keys(results).length > 0 && (
          <div className="px-6 py-2.5 border-b border-gray-100 flex-shrink-0 flex items-center gap-3 bg-gray-50">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-tss-red rounded-full transition-all duration-300"
                style={{ width: `${(loadedCount / regionalStores.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap font-medium">
              {loadedCount}/{regionalStores.length} stores loaded
              {allLoaded && totalServiceable > 0 && (
                <span className="ml-2 text-green-600">{totalServiceable.toLocaleString()} total serviceable</span>
              )}
            </span>
          </div>
        )}

        {/* Store grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedCity ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <MapPin className="w-14 h-14 text-gray-200 mb-3" />
              <p className="text-gray-500 font-semibold">Select a region to get started</p>
              <p className="text-sm text-gray-400 mt-1">
                Cached results load instantly · uncached stores are fetched one by one to keep API load low
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {regionalStores.map(store => (
                <StoreCard
                  key={store.id}
                  store={store}
                  result={results[store.id]}
                  onExport={() => exportStoreCSV(store)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StoreCard({ store, result: r, onExport }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm truncate">{store.store_name}</p>
            {!!store.is_hyperlocal && <HyperlocalBadge />}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{store.address || store.pincode || '—'}</p>
        </div>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${store.is_active ? 'bg-green-400' : 'bg-gray-300'}`} />
      </div>

      {!r ? (
        <p className="text-xs text-gray-300 italic">Not yet fetched</p>
      ) : r.loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw className="w-3 h-3 animate-spin text-tss-red flex-shrink-0" />
          Fetching pincodes…
        </div>
      ) : r.error ? (
        <div className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {r.error}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            <span className="text-xs font-medium text-gray-700">
              {r.pincodes?.length || 0} serviceable
            </span>
            {r.excluded?.length > 0 && (
              <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                +{r.excluded.length} hidden
              </span>
            )}
            {r.cached && (
              <span className="ml-auto text-xs text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">
                Cached
              </span>
            )}
          </div>
          {(r.pincodes?.length > 0 || r.excluded?.length > 0) && (
            <button
              onClick={onExport}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg text-xs font-medium transition-colors"
            >
              <Download className="w-3 h-3" />Export Excel
            </button>
          )}
        </>
      )}
    </div>
  );
}
