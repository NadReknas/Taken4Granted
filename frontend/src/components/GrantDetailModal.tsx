import { useState, useEffect } from 'react';
import { X, ExternalLink, Loader2, DollarSign, Building2, Calendar, Mail, Phone, FileText } from 'lucide-react';
import DOMPurify from 'dompurify';
import { fetchGrantDetail, type GrantDetail } from '../lib/api';

interface Props {
  opportunityId: number;
  onClose: () => void;
}

export default function GrantDetailModal({ opportunityId, onClose }: Props) {
  const [detail, setDetail] = useState<GrantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGrantDetail(opportunityId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [opportunityId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 pr-8 leading-snug">
            {loading ? 'Loading...' : detail?.title || 'Grant Details'}
          </h2>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-blue-500" />
              <span className="ml-2 text-gray-600">Fetching details from Grants.gov...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {detail && !loading && (
            <div className="space-y-6">
              {/* Key info */}
              <div className="grid grid-cols-2 gap-4">
                <InfoItem
                  icon={<Building2 size={16} />}
                  label="Agency"
                  value={detail.agency_name || detail.agency_code || 'N/A'}
                />
                <InfoItem
                  icon={<FileText size={16} />}
                  label="Opportunity #"
                  value={detail.opportunity_number}
                />
                <InfoItem
                  icon={<DollarSign size={16} />}
                  label="Award Range"
                  value={
                    detail.award_floor !== null || detail.award_ceiling !== null
                      ? `$${(detail.award_floor ?? 0).toLocaleString()} - $${(detail.award_ceiling ?? 0).toLocaleString()}`
                      : 'Not specified'
                  }
                />
                <InfoItem
                  icon={<Calendar size={16} />}
                  label="Posted"
                  value={detail.posting_date || 'N/A'}
                />
              </div>

              {/* Tags */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Funding Type</h3>
                <div className="flex flex-wrap gap-2">
                  {detail.funding_instruments.map((fi, i) => (
                    <span
                      key={i}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        fi.description?.toLowerCase().includes('grant')
                          ? 'bg-green-100 text-green-800'
                          : fi.description?.toLowerCase().includes('loan')
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {fi.description || fi.id}
                    </span>
                  ))}
                  {detail.cost_sharing && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      Cost Sharing Required
                    </span>
                  )}
                </div>
              </div>

              {/* Eligible applicants */}
              {detail.applicant_types.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Eligible Applicant Types
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.applicant_types.map((at, i) => (
                      <span
                        key={i}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          at.description?.includes('Individual')
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {at.description || at.id}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Categories */}
              {detail.funding_categories.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Funding Categories
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.funding_categories.map((fc, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700"
                      >
                        {fc.description || fc.id}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ALNs */}
              {detail.alns.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Assistance Listing Numbers (ALN)
                  </h3>
                  <div className="space-y-1">
                    {detail.alns.map((aln, i) => (
                      <p key={i} className="text-sm text-gray-600">
                        <span className="font-mono font-medium">{aln.alnNumber}</span>
                        {aln.programTitle && ` — ${aln.programTitle}`}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {detail.description && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
                  <div
                    className="prose prose-sm max-w-none text-gray-600"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(detail.description) }}
                  />
                </div>
              )}

              {/* Contact info */}
              {(detail.agency_contact_name || detail.agency_contact_email) && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Agency Contact</h3>
                  <div className="space-y-2 text-sm">
                    {detail.agency_contact_name && (
                      <p className="text-gray-700">{detail.agency_contact_name}</p>
                    )}
                    {detail.agency_contact_email && (
                      <p className="flex items-center gap-2 text-gray-600">
                        <Mail size={14} />
                        <a href={`mailto:${detail.agency_contact_email}`} className="text-blue-600 hover:underline">
                          {detail.agency_contact_email}
                        </a>
                      </p>
                    )}
                    {detail.agency_contact_phone && (
                      <p className="flex items-center gap-2 text-gray-600">
                        <Phone size={14} />
                        {detail.agency_contact_phone}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {detail.attachments.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Attachments</h3>
                  <div className="space-y-2">
                    {detail.attachments.map((att, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-2"
                      >
                        <FileText size={14} />
                        <span>{att.fileName}</span>
                        <span className="text-xs text-gray-400">({att.folderType})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              {detail.application_url && (
                <a
                  href={detail.application_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors no-underline"
                >
                  <ExternalLink size={16} />
                  View on Grants.gov
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value}</p>
      </div>
    </div>
  );
}
