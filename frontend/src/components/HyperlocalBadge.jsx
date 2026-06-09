import { Zap } from 'lucide-react';

export default function HyperlocalBadge({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-600 text-white ${className}`}>
      <Zap className="w-3 h-3" />
      Hyperlocal
    </span>
  );
}
