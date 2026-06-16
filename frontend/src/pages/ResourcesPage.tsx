import { ExternalLink, AlertTriangle, BookOpen, FileText, ShieldCheck } from 'lucide-react';

export default function ResourcesPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Grant Resources</h1>
        <p className="text-gray-600 text-sm mt-1">
          Everything you need to know about finding and applying for grants as an individual.
        </p>
      </div>

      {/* Scam warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800 mb-1">Watch Out for Grant Scams</h3>
            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
              <li>Legitimate grants <strong>never</strong> require upfront fees or payments</li>
              <li>The government will never call you to offer a grant unsolicited</li>
              <li>Be wary of "guaranteed" grant offers — grants are competitive</li>
              <li>Only use official government websites (.gov) for applications</li>
              <li>If it sounds too good to be true, it probably is</li>
            </ul>
          </div>
        </div>
      </div>

      {/* What is a grant */}
      <Section
        icon={<BookOpen size={18} />}
        title="What is a Grant?"
      >
        <p className="text-sm text-gray-600 mb-3">
          A grant is financial assistance given by a government agency, foundation, or organization
          for a specific purpose. Unlike loans, most grants <strong>do not need to be repaid</strong>.
          However, grants come with conditions — you must use the funds for the stated purpose
          and may need to report on how you spent the money.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <TypeCard
            title="Pure Grant"
            description="Free money — no repayment required if conditions are met"
            color="bg-green-50 border-green-200 text-green-800"
          />
          <TypeCard
            title="Forgivable Loan"
            description="Forgiven if you meet conditions (e.g., live in home for 5 years)"
            color="bg-yellow-50 border-yellow-200 text-yellow-800"
          />
          <TypeCard
            title="Matching Grant"
            description="Requires you to contribute a percentage of the total cost"
            color="bg-blue-50 border-blue-200 text-blue-800"
          />
        </div>
      </Section>

      {/* Individuals vs organizations */}
      <Section
        icon={<ShieldCheck size={18} />}
        title="Grants for Individuals vs. Organizations"
      >
        <p className="text-sm text-gray-600 mb-3">
          Most federal grants on Grants.gov are designed for <strong>organizations</strong>
          (nonprofits, governments, educational institutions). However, there are important categories
          available to <strong>individuals</strong>:
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <CategoryCard title="Housing" items={['Section 8 vouchers', 'Down payment assistance', 'Home repair grants', 'Weatherization assistance']} />
          <CategoryCard title="Education" items={['Pell Grants', 'FAFSA', 'TEACH Grants', 'Vocational training']} />
          <CategoryCard title="Veterans" items={['GI Bill education benefits', 'VA home loan guaranty', 'SAH/SHA housing grants', 'Veteran business grants']} />
          <CategoryCard title="Emergency/Disaster" items={['FEMA Individual Assistance', 'SBA disaster loans', 'Emergency rental assistance', 'Utility assistance (LIHEAP)']} />
          <CategoryCard title="Business Startup" items={['SBA microloans', 'SBIR/STTR grants', 'Minority business grants', 'Women-owned business programs']} />
          <CategoryCard title="Daily Life" items={['SNAP (food assistance)', 'TANF (cash assistance)', 'Childcare assistance', 'Job training programs']} />
        </div>
      </Section>

      {/* WA State specific */}
      <Section
        icon={<FileText size={18} />}
        title="Washington State Resources"
      >
        <p className="text-sm text-gray-600 mb-3">
          Key Washington State grant and assistance programs:
        </p>
        <div className="space-y-2">
          <ResourceLink
            title="WA Department of Commerce — Housing"
            url="https://www.commerce.wa.gov/building-infrastructure/housing/"
            description="Down payment assistance, housing trust fund, weatherization"
          />
          <ResourceLink
            title="WA Community Action Agencies"
            url="https://www.washingtonstateca.org/"
            description="Energy assistance, housing, emergency services by county"
          />
          <ResourceLink
            title="WA Small Business Development Center"
            url="https://wsbdc.org/"
            description="Free business advising, grants, and loan assistance"
          />
          <ResourceLink
            title="Benefits.gov — WA State Benefits"
            url="https://www.benefits.gov/categories/Housing"
            description="Federal benefits finder filtered by state"
          />
          <ResourceLink
            title="SAM.gov — Registration"
            url="https://sam.gov/entity-registration"
            description="Required for most federal grant applications"
          />
          <ResourceLink
            title="Grants.gov"
            url="https://www.grants.gov/"
            description="Official federal grant search and application portal"
          />
        </div>
      </Section>

      {/* Glossary */}
      <Section
        icon={<BookOpen size={18} />}
        title="Glossary of Key Terms"
      >
        <div className="space-y-3">
          <GlossaryItem term="UEI" definition="Unique Entity Identifier — a 12-character ID assigned by SAM.gov, required for federal grant applications. Replaced the old DUNS number in 2022." />
          <GlossaryItem term="ALN (CFDA)" definition="Assistance Listing Number — a unique identifier for each federal assistance program. Formerly called the CFDA number." />
          <GlossaryItem term="SF-424" definition="Standard Form 424 — the main application form for federal grants. There's a specific version for individuals (SF-424 Individual)." />
          <GlossaryItem term="SAM.gov" definition="System for Award Management — the government-wide registry for entities doing business with the federal government. Registration is required and can take 7-10 business days." />
          <GlossaryItem term="Cost Sharing" definition="When the applicant is required to contribute a portion of the total project cost, either in cash or in-kind services." />
          <GlossaryItem term="Cooperative Agreement" definition="Similar to a grant but involves more interaction between the funding agency and the recipient. Not a loan — no repayment required." />
          <GlossaryItem term="FOA / NOFO" definition="Funding Opportunity Announcement / Notice of Funding Opportunity — the official announcement of an available grant, including eligibility requirements and application instructions." />
          <GlossaryItem term="FPL" definition="Federal Poverty Level — income thresholds used to determine eligibility for many grant programs. Many programs set eligibility at 100%-400% of FPL." />
          <GlossaryItem term="Block Grant" definition="Federal funds given to state/local governments to distribute. Many individual grants are actually administered through block grant programs (e.g., CDBG for housing)." />
          <GlossaryItem term="Formula Grant" definition="Grants distributed based on a formula (e.g., population, poverty rate) rather than competition. If you qualify, you receive it." />
        </div>
      </Section>

      {/* Application checklist */}
      <Section
        icon={<FileText size={18} />}
        title="Application Preparation Checklist"
      >
        <p className="text-sm text-gray-600 mb-3">
          Before applying for any federal grant, make sure you have:
        </p>
        <div className="space-y-2">
          {[
            'Valid government-issued ID',
            'Social Security Number',
            'Proof of U.S. citizenship or legal residency',
            'Proof of income (tax returns, pay stubs, W-2s)',
            'Proof of residence (utility bills, lease agreement)',
            'SAM.gov registration (if applying for federal grants)',
            'UEI number from SAM.gov',
            'Grants.gov account (for federal submissions)',
            'Bank account information (for direct deposit)',
            'Project description / plan for how funds will be used',
            'Budget breakdown (how much you need and what for)',
            'Any program-specific required documents',
          ].map((item, i) => (
            <label key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <input type="checkbox" className="mt-1 rounded border-gray-300" />
              {item}
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function TypeCard({ title, description, color }: { title: string; description: string; color: string }) {
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <h4 className="font-medium text-sm mb-1">{title}</h4>
      <p className="text-xs opacity-80">{description}</p>
    </div>
  );
}

function CategoryCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <h4 className="font-medium text-sm text-gray-800 mb-2">{title}</h4>
      <ul className="text-xs text-gray-600 space-y-1">
        {items.map((item, i) => (
          <li key={i}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function ResourceLink({ title, url, description }: { title: string; url: string; description: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors no-underline group"
    >
      <ExternalLink size={16} className="text-gray-400 group-hover:text-blue-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </a>
  );
}

function GlossaryItem({ term, definition }: { term: string; definition: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-gray-800">{term}</dt>
      <dd className="text-sm text-gray-600 mt-0.5">{definition}</dd>
    </div>
  );
}
