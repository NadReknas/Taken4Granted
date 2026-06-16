import { Link } from 'react-router-dom';
import { Search, Bookmark, ClipboardList, Shield, DollarSign, Users } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="text-center py-12">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
          <Shield size={16} />
          Free Grant Research Tool
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
          Find Grants You Qualify For
        </h1>
        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
          Search federal, state, and local grants available to individuals in Washington State.
          Filter by amount, eligibility, and category. Track your applications from research to submission.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/search"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors no-underline"
          >
            <Search size={18} />
            Search Grants
          </Link>
          <Link
            to="/resources"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors no-underline"
          >
            Learn About Grants
          </Link>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-12">
        <FeatureCard
          icon={<Search className="text-blue-600" size={24} />}
          title="Smart Search"
          description="Search thousands of grant opportunities with filters for dollar amount, eligibility, category, and deadline."
        />
        <FeatureCard
          icon={<Bookmark className="text-yellow-600" size={24} />}
          title="Save & Track"
          description="Bookmark interesting grants, save your searches, and track your application progress."
        />
        <FeatureCard
          icon={<ClipboardList className="text-green-600" size={24} />}
          title="Application Pipeline"
          description="Manage your grants from research through submission with our built-in application tracker."
        />
      </div>

      {/* Quick stats */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-12">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">What You Can Find</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<DollarSign size={20} />} label="Housing Grants" color="text-green-600" />
          <StatCard icon={<Users size={20} />} label="Individual Eligible" color="text-blue-600" />
          <StatCard icon={<Shield size={20} />} label="No Repayment" color="text-purple-600" />
          <StatCard icon={<Search size={20} />} label="WA State Focus" color="text-orange-600" />
        </div>
      </div>

      {/* Priority categories for Daniel */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Searches for You</h2>
        <p className="text-sm text-gray-600 mb-4">Based on your priorities (housing, daily life, business):</p>
        <div className="flex flex-wrap gap-2">
          <QuickSearchTag label="Housing Assistance" href="/search?keyword=housing&funding_categories=HO" />
          <QuickSearchTag label="Energy & Utilities" href="/search?keyword=energy+assistance&funding_categories=EN" />
          <QuickSearchTag label="Small Business" href="/search?keyword=small+business&funding_categories=BC" />
          <QuickSearchTag label="Income Security" href="/search?keyword=income+security&funding_categories=ISS" />
          <QuickSearchTag label="Food & Nutrition" href="/search?keyword=food+nutrition&funding_categories=FN" />
          <QuickSearchTag label="Disaster Relief" href="/search?keyword=disaster+relief&funding_categories=DPR" />
          <QuickSearchTag label="Job Training" href="/search?keyword=job+training&funding_categories=ELT" />
          <QuickSearchTag label="Community Development" href="/search?keyword=community&funding_categories=CD" />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

function StatCard({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`inline-flex ${color} mb-1`}>{icon}</div>
      <p className="text-sm font-medium text-gray-700">{label}</p>
    </div>
  );
}

function QuickSearchTag({ label, href }: { label: string; href: string }) {
  return (
    <Link
      to={href}
      className="px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors no-underline"
    >
      {label}
    </Link>
  );
}
