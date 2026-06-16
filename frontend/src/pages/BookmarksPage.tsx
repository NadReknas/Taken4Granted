import { useState, useEffect } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import GrantCard from '../components/GrantCard';
import GrantDetailModal from '../components/GrantDetailModal';
import type { GrantSummary } from '../lib/api';

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<GrantSummary[]>([]);
  const [selectedGrantId, setSelectedGrantId] = useState<number | null>(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('t4g_bookmarks') || '[]');
    setBookmarks(stored);
  }, []);

  const removeBookmark = (grantId: number) => {
    const updated = bookmarks.filter((b) => b.id !== grantId);
    setBookmarks(updated);
    localStorage.setItem('t4g_bookmarks', JSON.stringify(updated));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bookmarked Grants</h1>
        <p className="text-gray-600 text-sm mt-1">
          Grants you've saved for later review. Bookmarks are stored locally in your browser.
        </p>
      </div>

      {bookmarks.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Bookmark size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No bookmarks yet</p>
          <p className="text-sm mt-1">
            Search for grants and click the bookmark icon to save them here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookmarks.map((grant) => (
            <div key={grant.id} className="relative">
              <GrantCard
                grant={grant}
                onSelect={setSelectedGrantId}
              />
              <button
                onClick={() => removeBookmark(grant.id)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                title="Remove bookmark"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedGrantId && (
        <GrantDetailModal
          opportunityId={selectedGrantId}
          onClose={() => setSelectedGrantId(null)}
        />
      )}
    </div>
  );
}
