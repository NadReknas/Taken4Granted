import { useState, useEffect } from 'react';
import { User, Save, CheckCircle } from 'lucide-react';

interface Profile {
  name: string;
  email: string;
  state: string;
  county: string;
  city: string;
  citizenship_status: string;
  veteran_status: string;
  gender: string;
  race_ethnicity: string;
  age_bracket: string;
  income_bracket: string;
  disability_status: string;
  education_level: string;
  homeownership_status: string;
  business_owner: boolean;
  employment_status: string;
}

const EMPTY_PROFILE: Profile = {
  name: '',
  email: '',
  state: 'WA',
  county: '',
  city: '',
  citizenship_status: '',
  veteran_status: '',
  gender: '',
  race_ethnicity: '',
  age_bracket: '',
  income_bracket: '',
  disability_status: '',
  education_level: '',
  homeownership_status: '',
  business_owner: false,
  employment_status: '',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('t4g_profile');
    if (stored) setProfile(JSON.parse(stored));
  }, []);

  const handleSave = () => {
    localStorage.setItem('t4g_profile', JSON.stringify(profile));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (field: keyof Profile, value: string | boolean) => {
    setProfile((p) => ({ ...p, [field]: value }));
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
        <p className="text-gray-600 text-sm mt-1">
          Fill out your eligibility profile to help match you with relevant grants.
          All data is stored locally in your browser.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        {/* Basic info */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <User size={16} />
            Basic Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full Name" value={profile.name} onChange={(v) => update('name', v)} />
            <Field label="Email" value={profile.email} onChange={(v) => update('email', v)} type="email" />
            <SelectField
              label="State"
              value={profile.state}
              onChange={(v) => update('state', v)}
              options={[
                { value: 'WA', label: 'Washington' },
                { value: 'OR', label: 'Oregon' },
                { value: 'CA', label: 'California' },
                { value: 'ID', label: 'Idaho' },
                { value: '', label: 'Other (type below)' },
              ]}
            />
            <Field label="County" value={profile.county} onChange={(v) => update('county', v)} />
            <Field label="City" value={profile.city} onChange={(v) => update('city', v)} />
          </div>
        </section>

        {/* Demographic */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Demographic Information</h2>
          <p className="text-xs text-gray-500 mb-3">
            Used to match you with grants that have specific eligibility criteria.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField
              label="Citizenship Status"
              value={profile.citizenship_status}
              onChange={(v) => update('citizenship_status', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'us_citizen', label: 'U.S. Citizen' },
                { value: 'permanent_resident', label: 'Permanent Resident' },
                { value: 'foreign_national', label: 'Foreign National' },
                { value: 'daca', label: 'DACA Recipient' },
                { value: 'refugee', label: 'Refugee/Asylee' },
              ]}
            />
            <SelectField
              label="Veteran Status"
              value={profile.veteran_status}
              onChange={(v) => update('veteran_status', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'none', label: 'Not a veteran' },
                { value: 'veteran', label: 'Veteran' },
                { value: 'active_duty', label: 'Active Duty' },
                { value: 'reservist', label: 'Reservist/National Guard' },
                { value: 'military_spouse', label: 'Military Spouse' },
              ]}
            />
            <SelectField
              label="Gender"
              value={profile.gender}
              onChange={(v) => update('gender', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'non_binary', label: 'Non-binary' },
                { value: 'prefer_not', label: 'Prefer not to say' },
              ]}
            />
            <SelectField
              label="Race/Ethnicity"
              value={profile.race_ethnicity}
              onChange={(v) => update('race_ethnicity', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'white', label: 'White' },
                { value: 'black', label: 'Black/African American' },
                { value: 'hispanic', label: 'Hispanic/Latino' },
                { value: 'asian', label: 'Asian' },
                { value: 'native_american', label: 'Native American/Alaska Native' },
                { value: 'pacific_islander', label: 'Native Hawaiian/Pacific Islander' },
                { value: 'two_or_more', label: 'Two or more races' },
                { value: 'prefer_not', label: 'Prefer not to say' },
              ]}
            />
            <SelectField
              label="Age Bracket"
              value={profile.age_bracket}
              onChange={(v) => update('age_bracket', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: '18_24', label: '18-24' },
                { value: '25_34', label: '25-34' },
                { value: '35_44', label: '35-44' },
                { value: '45_54', label: '45-54' },
                { value: '55_64', label: '55-64' },
                { value: '65_plus', label: '65+' },
              ]}
            />
            <SelectField
              label="Income Bracket (Annual)"
              value={profile.income_bracket}
              onChange={(v) => update('income_bracket', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'under_25k', label: 'Under $25,000' },
                { value: '25k_50k', label: '$25,000 - $50,000' },
                { value: '50k_75k', label: '$50,000 - $75,000' },
                { value: '75k_100k', label: '$75,000 - $100,000' },
                { value: 'over_100k', label: 'Over $100,000' },
              ]}
            />
            <SelectField
              label="Disability Status"
              value={profile.disability_status}
              onChange={(v) => update('disability_status', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'none', label: 'No disability' },
                { value: 'physical', label: 'Physical disability' },
                { value: 'mental', label: 'Mental health condition' },
                { value: 'developmental', label: 'Developmental disability' },
                { value: 'prefer_not', label: 'Prefer not to say' },
              ]}
            />
            <SelectField
              label="Education Level"
              value={profile.education_level}
              onChange={(v) => update('education_level', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'less_than_hs', label: 'Less than high school' },
                { value: 'high_school', label: 'High school / GED' },
                { value: 'some_college', label: 'Some college' },
                { value: 'associates', label: "Associate's degree" },
                { value: 'bachelors', label: "Bachelor's degree" },
                { value: 'masters', label: "Master's degree" },
                { value: 'doctorate', label: 'Doctorate / Professional' },
              ]}
            />
            <SelectField
              label="Homeownership Status"
              value={profile.homeownership_status}
              onChange={(v) => update('homeownership_status', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'renter', label: 'Renter' },
                { value: 'homeowner', label: 'Homeowner' },
                { value: 'first_time_buyer', label: 'First-time homebuyer' },
                { value: 'homeless', label: 'Experiencing homelessness' },
              ]}
            />
            <SelectField
              label="Employment Status"
              value={profile.employment_status}
              onChange={(v) => update('employment_status', v)}
              options={[
                { value: '', label: 'Select...' },
                { value: 'employed_ft', label: 'Employed full-time' },
                { value: 'employed_pt', label: 'Employed part-time' },
                { value: 'self_employed', label: 'Self-employed' },
                { value: 'unemployed', label: 'Unemployed' },
                { value: 'retired', label: 'Retired' },
                { value: 'student', label: 'Student' },
                { value: 'disabled', label: 'Unable to work' },
              ]}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              id="business_owner"
              checked={profile.business_owner}
              onChange={(e) => update('business_owner', e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="business_owner" className="text-sm text-gray-700">
              I own or plan to start a business
            </label>
          </div>
        </section>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors"
        >
          {saved ? (
            <>
              <CheckCircle size={16} />
              Saved!
            </>
          ) : (
            <>
              <Save size={16} />
              Save Profile
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
