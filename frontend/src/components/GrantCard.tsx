import { DollarSign, Calendar, Building2, Tag } from 'lucide-react';
import type { GrantSummary } from '../lib/api';

function formatCurrency(val: number | null): string {
  if (val === null || val === undefined) return 'N/A';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

interface GrantCardProps {
  grant: GrantSummary;
  onSelect: (id: number) => void;
  onBookmark?: (grant: GrantSummary) => void;
  isBookmarked?: boolean;
}

export default function GrantCard({ grant, onSelect, onBookmark, isBookmarked }: GrantCardProps) {
  const statusColor: Record<string, string> = {
    posted: 'bg-green-100 text-green-800',
    forecasted: 'bg-yellow-100 text-yellow-800',
    closed: 'bg-red-100 text-red-800',
    archived: 'bg-gray-100 text-gray-600',
  };

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
      onClick={() => onSelect(grant.id)}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2">
            {grant.title}
          </h3>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
            <Building2 size={14} />
            {grant.agency || 'Unknown Agency'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {grant.status && (
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                statusColor[grant.status.toLowerCase()] || 'bg-gray-100 text-gray-600'
              }`}
            >
              {grant.status}
            </span>
          )}
          {onBookmark && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBookmark(grant);
              }}
              className={`p-1.5 rounded-lg transition-colors ${
                isBookmarked
                  ? 'bg-yellow-100 text-yellow-600'
                  : 'bg-gray-100 text-gray-400 hover:text-yellow-500'
              }`}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this grant'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill={isBookmarked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="flex items-center gap-1 text-gray-600">
          <DollarSign size={14} className="text-green-600" />
          {grant.award_floor !== null || grant.award_ceiling !== null ? (
            <>
              {formatCurrency(grant.award_floor)} - {formatCurrency(grant.award_ceiling)}
            </>
          ) : (
            'Amount not specified'
          )}
        </span>

        {grant.close_date && (
          <span className="flex items-center gap-1 text-gray-600">
            <Calendar size={14} className="text-blue-500" />
            Closes: {grant.close_date}
          </span>
        )}

        {grant.cost_sharing && (
          <span className="flex items-center gap-1 text-orange-600">
            <Tag size={14} />
            Cost sharing required
          </span>
        )}
      </div>

      {grant.funding_categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {grant.funding_categories.slice(0, 3).map((cat, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium"
            >
              {cat.description || cat.id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
