import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import GrantCard from '../components/GrantCard';
import GrantDetailModal from '../components/GrantDetailModal';
import { searchGrants, type GrantSummary, type SearchResponse } from '../lib/api';

const FUNDING_CATEGORIES: Record<string, string> = {
  '': 'All Categories',
  AG: 'Agriculture',
  AR: 'Arts',
  BC: 'Business & Commerce',
  CD: 'Community Development',
  DPR: 'Disaster Prevention & Relief',
  ED: 'Education',
  ELT: 'Employment, Labor & Training',
  EN: 'Energy',
  ENV: 'Environment',
  FN: 'Food & Nutrition',
  HL: 'Health',
  HO: 'Housing',
  HU: 'Humanities',
  ISS: 'Income Security & Social Services',
  LJL: 'Law, Justice & Legal',
  NR: 'Natural Resources',
  ST: 'Transportation',
};

const APPLICANT_TYPES: Record<string, string> = {
  '': 'All Applicant Types',
  '21': 'Individuals',
  '99': 'Unrestricted',
  '23': 'Small businesses',
  '25': 'Others',
  '12': 'Nonprofits (501c3)',
};

const STATUS_OPTIONS: Record<string, string> = {
  'forecasted|posted': 'Open & Forecasted',
  posted: 'Open Only',
  forecasted: 'Forecasted Only',
  closed: 'Closed',
};

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  const [category, setCategory] = useState(searchParams.get('funding_categories') || '');
  const [eligibility, setEligibility] = useState(searchParams.get('eligibilities') || '21');
  const [status, setStatus] = useState('forecasted|posted');
  const [awardFloor, setAwardFloor] = useState('');
  const [awardCeiling, setAwardCeiling] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGrantId, setSelectedGrantId] = useState<number | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  const doSearch = useCallback(
    async (p: number = 1) => {
      setLoading(true);
      setError(null);
      try {
        const resp = await searchGrants({
          keyword,
          eligibilities: eligibility,
          agencies: '',
          opp_statuses: status,
          funding_categories: category,
          rows: 20,
          page: p,
          award_floor: awardFloor ? parseFloat(awardFloor) : null,
          award_ceiling: awardCeiling ? parseFloat(awardCeiling) : null,
        });
        setResults(resp);
        setPage(p);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [keyword, eligibility, status, category, awardFloor, awardCeiling]
  );

  useEffect(() => {
    const kw = searchParams.get('keyword');
    const fc = searchParams.get('funding_categories');
    if (kw || fc) {
      if (kw) setKeyword(kw);
      if (fc) setCategory(fc);
      // Trigger search on URL params
      const timer = setTimeout(() => doSearch(1), 100);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (keyword) params.keyword = keyword;
    if (category) params.funding_categories = category;
    if (eligibility) params.eligibilities = eligibility;
    setSearchParams(params);
    doSearch(1);
  };

  const toggleBookmark = (grant: GrantSummary) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      const key = String(grant.id);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Store in localStorage for the bookmarks page
        const bookmarks = JSON.parse(localStorage.getItem('t4g_bookmarks') || '[]');
        if (!bookmarks.find((b: GrantSummary) => b.id === grant.id)) {
          bookmarks.push(grant);
          localStorage.setItem('t4g_bookmarks', JSON.stringify(bookmarks));
        }
      }
      return next;
    });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Search Grants</h1>
        <p className="text-gray-600 text-sm mt-1">
          Search federal grants from Grants.gov. Defaults to grants available to individuals.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search grants by keyword (e.g., housing, small business, education)..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Search
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2.5 border rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
              showFilters
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={16} />
            Filters
          </button>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(FUNDING_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Applicant Type
              </label>
              <select
                value={eligibility}
                onChange={(e) => setEligibility(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(APPLICANT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(STATUS_OPTIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Min Award ($)
              </label>
              <input
                type="number"
                value={awardFloor}
                onChange={(e) => setAwardFloor(e.target.value)}
                placeholder="e.g., 1000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Max Award ($)
              </label>
              <input
                type="number"
                value={awardCeiling}
                onChange={(e) => setAwardCeiling(e.target.value)}
                placeholder="e.g., 100000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600">Searching Grants.gov...</span>
        </div>
      )}

      {!loading && results && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{results.total.toLocaleString()}</span> grants
              found
            </p>
            <p className="text-sm text-gray-500">
              Page {page} of {Math.ceil(results.total / 20)}
            </p>
          </div>

          <div className="space-y-3">
            {results.results.map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                onSelect={setSelectedGrantId}
                onBookmark={toggleBookmark}
                isBookmarked={bookmarkedIds.has(String(grant.id))}
              />
            ))}
          </div>

          {results.results.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <Search size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No grants found</p>
              <p className="text-sm mt-1">Try different keywords or adjust your filters</p>
            </div>
          )}

          {/* Pagination */}
          {results.total > 20 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => doSearch(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {Math.ceil(results.total / 20)}
              </span>
              <button
                onClick={() => doSearch(page + 1)}
                disabled={page >= Math.ceil(results.total / 20)}
                className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {!loading && !results && !error && (
        <div className="text-center py-16 text-gray-500">
          <Search size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Start your grant search</p>
          <p className="text-sm mt-1">
            Enter keywords or use the filters to find grants you qualify for
          </p>
        </div>
      )}

      {/* Detail modal */}
      {selectedGrantId && (
        <GrantDetailModal
          opportunityId={selectedGrantId}
          onClose={() => setSelectedGrantId(null)}
        />
      )}
    </div>
  );
}
