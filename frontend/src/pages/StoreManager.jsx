import { useState, useEffect, useRef } from 'react';
import { storesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import AccessDeniedModal from '../components/AccessDeniedModal';
import toast from 'react-hot-toast';
import {
  Upload, Plus, Search, Store, MapPin, Phone, Mail,
  Clock, CheckCircle, XCircle, Trash2, X, RefreshCw, Zap, Pencil
} from 'lucide-react';
import HyperlocalBadge from '../components/HyperlocalBadge';

const EMPTY_FORM = {
  store_name: '', address: '', city_name: '', state_name: '',
  latitude: '', longitude: '', pincode: '', phone: '', email: '',
  opening_time: '10:00:00', closing_time: '22:00:00', gstin: '', location_code: '',
  is_hyperlocal: false, is_active: true,
};

function storeToForm(store) {
  return {
    store_name: store.store_name || '',
    address: store.address || '',
    city_name: store.city_name || '',
    state_name: store.state_name || '',
    latitude: String(store.latitude ?? ''),
    longitude: String(store.longitude ?? ''),
    pincode: store.pincode || '',
    phone: store.phone || '',
    email: store.email || '',
    opening_time: store.opening_time || '10:00:00',
    closing_time: store.closing_time || '22:00:00',
    gstin: store.gstin || '',
    location_code: store.location_code || '',
    is_hyperlocal: !!store.is_hyperlocal,
    is_active: store.is_active !== 0,
  };
}

function StoreFormModal({ store, onClose, onSaved, onAccessDenied }) {
  const isEdit = !!store;
  const [form, setForm] = useState(() => (store ? storeToForm(store) : { ...EMPTY_FORM }));
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.store_name || !form.latitude || !form.longitude) {
      toast.error('Store name, latitude, and longitude are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        is_active: form.is_active ? 1 : 0,
        is_hyperlocal: form.is_hyperlocal,
      };
      if (isEdit) {
        await storesApi.update(store.id, payload);
        toast.success('Store updated!');
      } else {
        await storesApi.create(payload);
        toast.success('Store added!');
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err.response?.status === 403) {
        onAccessDenied?.(isEdit ? 'edit stores' : 'add new stores');
        onClose();
      } else {
        toast.error(err.response?.data?.error || `Failed to ${isEdit ? 'update' : 'add'} store`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{isEdit ? 'Edit Store' : 'Add New Store'}</h2>
            {isEdit && <p className="text-xs text-gray-400 mt-0.5">ID {store.id} · changing lat/lon clears pincode cache</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Store Name *</label>
              <input className="input" value={form.store_name} onChange={e => set('store_name', e.target.value)} placeholder="Bandra, Mumbai" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude *</label>
              <input className="input" type="number" step="any" value={form.latitude} onChange={e => set('latitude', e.target.value)} placeholder="19.063825" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude *</label>
              <input className="input" type="number" step="any" value={form.longitude} onChange={e => set('longitude', e.target.value)} placeholder="72.835859" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input className="input" value={form.city_name} onChange={e => set('city_name', e.target.value)} placeholder="MUMBAI" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input className="input" value={form.state_name} onChange={e => set('state_name', e.target.value)} placeholder="Maharashtra" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
              <input className="input" value={form.pincode} onChange={e => set('pincode', e.target.value)} placeholder="400050" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location Code</label>
              <input className="input" value={form.location_code} onChange={e => set('location_code', e.target.value)} placeholder="S01" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="store@thesouledstore.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opening Time</label>
              <input className="input" type="time" value={form.opening_time.slice(0, 5)} onChange={e => set('opening_time', e.target.value + ':00')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Closing Time</label>
              <input className="input" type="time" value={form.closing_time.slice(0, 5)} onChange={e => set('closing_time', e.target.value + ':00')} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
              <input className="input" value={form.gstin} onChange={e => set('gstin', e.target.value)} placeholder="27AAECT9591L1ZI" />
            </div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:border-violet-300 transition-colors">
                <input
                  type="checkbox"
                  checked={form.is_hyperlocal}
                  onChange={e => set('is_hyperlocal', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-violet-600" />
                    Hyperlocal
                  </p>
                </div>
              </label>
              {isEdit && (
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:border-green-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => set('is_active', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      Active store
                    </p>
                  </div>
                </label>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <><RefreshCw className="w-4 h-4 animate-spin" />Saving...</> : (isEdit ? 'Save Changes' : 'Add Store')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StoreManager() {
  const { isAdmin } = useAuth();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [accessDeniedAction, setAccessDeniedAction] = useState(null);
  const fileInputRef = useRef(null);

  const requireAdmin = (action, callback) => {
    if (!isAdmin) {
      setAccessDeniedAction(action);
      return;
    }
    callback();
  };

  useEffect(() => { loadStores(); }, []);

  const loadStores = async () => {
    setLoading(true);
    try {
      const { data } = await storesApi.getAll();
      setStores(data);
    } catch {
      toast.error('Failed to load stores');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = async (e) => {
    if (!isAdmin) {
      setAccessDeniedAction('bulk upload stores');
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) { toast.error('Please upload a JSON file'); return; }

    setUploading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const stores = Array.isArray(data) ? data : [data];
      const { data: result } = await storesApi.bulkUpload(stores);
      toast.success(`Upload complete: ${result.inserted} new, ${result.updated} updated`);
      loadStores();
    } catch (err) {
      if (err instanceof SyntaxError) toast.error('Invalid JSON file');
      else if (err.response?.status === 403) setAccessDeniedAction('bulk upload stores');
      else toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const toggleHyperlocal = async (store) => {
    const next = !store.is_hyperlocal;
    try {
      await storesApi.update(store.id, { is_hyperlocal: next });
      setStores(s => s.map(x => x.id === store.id ? { ...x, is_hyperlocal: next ? 1 : 0 } : x));
      toast.success(next ? 'Marked as Hyperlocal' : 'Hyperlocal badge removed');
    } catch (err) {
      if (err.response?.status === 403) {
        setAccessDeniedAction('edit stores');
      } else {
        toast.error('Failed to update store');
      }
    }
  };

  const handleDelete = async (id) => {
    try {
      await storesApi.delete(id);
      toast.success('Store deleted');
      setStores(s => s.filter(x => x.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      if (err.response?.status === 403) {
        setDeleteConfirm(null);
        setAccessDeniedAction('delete stores');
      } else {
        toast.error(err.response?.data?.error || 'Delete failed');
      }
    }
  };

  const filtered = stores.filter(s =>
    s.store_name.toLowerCase().includes(search.toLowerCase()) ||
    s.city_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.pincode?.includes(search)
  );

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 space-y-6 pb-10">
      {accessDeniedAction && (
        <AccessDeniedModal
          action={accessDeniedAction}
          onClose={() => setAccessDeniedAction(null)}
        />
      )}
      {showAddModal && (
        <StoreFormModal
          onClose={() => setShowAddModal(false)}
          onSaved={loadStores}
          onAccessDenied={setAccessDeniedAction}
        />
      )}
      {editingStore && (
        <StoreFormModal
          store={editingStore}
          onClose={() => setEditingStore(null)}
          onSaved={loadStores}
          onAccessDenied={setAccessDeniedAction}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Manager</h1>
          <p className="text-gray-500 text-sm mt-1">{stores.length} stores · manage, upload, and add new locations</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleBulkUpload} />
          <button
            onClick={() => requireAdmin('bulk upload stores', () => fileInputRef.current?.click())}
            disabled={uploading}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {uploading ? <><RefreshCw className="w-4 h-4 animate-spin" />Uploading...</> : <><Upload className="w-4 h-4" />Bulk Upload JSON</>}
          </button>
          <button
            onClick={() => requireAdmin('add new stores', () => setShowAddModal(true))}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />Add Store
          </button>
        </div>
      </div>

      {/* Bulk upload hint */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
        <Upload className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>Bulk upload accepts the same JSON format as <code className="font-mono bg-blue-100 px-1 rounded">tss.json</code>. Existing store IDs are updated, new ones are inserted.</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by store name, city, or pincode..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-9"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-tss-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Store className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">
              {search ? 'No stores match your search' : 'No stores yet'}
            </p>
            {!search && (
              <p className="text-sm text-gray-400 mt-1">Click "Bulk Upload JSON" to import your stores</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-100 shadow-sm">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Store</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Coordinates</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Badge</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(store => (
                  <tr key={store.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900">{store.store_name}</p>
                        {!!store.is_hyperlocal && <HyperlocalBadge />}
                      </div>
                      <p className="text-xs text-gray-400">{store.location_code} · ID {store.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-gray-700">{store.city_name}, {store.state_name}</p>
                          <p className="text-xs text-gray-400">{store.pincode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      <p>{parseFloat(store.latitude).toFixed(5)}</p>
                      <p>{parseFloat(store.longitude).toFixed(5)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {store.phone && (
                        <div className="flex items-center gap-1 text-gray-600">
                          <Phone className="w-3 h-3" />{store.phone}
                        </div>
                      )}
                      {store.email && (
                        <div className="flex items-center gap-1 text-gray-500 text-xs truncate max-w-[160px]">
                          <Mail className="w-3 h-3 flex-shrink-0" />{store.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {store.opening_time?.slice(0, 5)} – {store.closing_time?.slice(0, 5)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={store.is_active ? 'badge-active' : 'badge-inactive'}>
                        {store.is_active ? <><CheckCircle className="w-3 h-3" /> Active</> : <><XCircle className="w-3 h-3" /> Inactive</>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => requireAdmin('edit stores', () => toggleHyperlocal(store))}
                        title={store.is_hyperlocal ? 'Remove Hyperlocal badge' : 'Mark as Hyperlocal'}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          store.is_hyperlocal
                            ? 'bg-violet-600 text-white hover:bg-violet-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-700'
                        }`}
                      >
                        <Zap className="w-3 h-3" />
                        {store.is_hyperlocal ? 'Hyperlocal' : 'Set badge'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => requireAdmin('edit stores', () => setEditingStore(store))}
                          className="text-gray-400 hover:text-tss-red transition-colors"
                          title="Edit store"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {deleteConfirm === store.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(store.id)} className="text-xs text-red-600 font-medium hover:text-red-800">Confirm</button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => requireAdmin('delete stores', () => setDeleteConfirm(store.id))}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete store"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
