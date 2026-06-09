import { X, ShieldAlert } from 'lucide-react';

const ADMIN_CONTACT = 'devansh.saxena@thesouledstore.com';

export default function AccessDeniedModal({ action = 'perform this action', onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-700">
            <ShieldAlert className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Access restricted</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-700">
            You don&apos;t have access to {action}. Contact{' '}
            <a href={`mailto:${ADMIN_CONTACT}`} className="text-tss-red font-medium hover:underline">
              {ADMIN_CONTACT}
            </a>{' '}
            for help.
          </p>
          <button onClick={onClose} className="w-full btn-secondary">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
