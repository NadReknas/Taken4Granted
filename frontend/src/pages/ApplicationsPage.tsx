import { useState, useEffect } from 'react';
import { ClipboardList, Plus, X, ChevronRight } from 'lucide-react';

interface TrackedApp {
  id: string;
  grantTitle: string;
  grantId: string;
  status: string;
  notes: string;
  deadline: string;
  createdAt: string;
}

const STATUS_PIPELINE = [
  { key: 'researching', label: 'Researching', color: 'bg-gray-100 text-gray-700' },
  { key: 'drafting', label: 'Drafting', color: 'bg-blue-100 text-blue-700' },
  { key: 'ready', label: 'Ready to Submit', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'submitted', label: 'Submitted', color: 'bg-purple-100 text-purple-700' },
  { key: 'awarded', label: 'Awarded', color: 'bg-green-100 text-green-800' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700' },
];

export default function ApplicationsPage() {
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newApp, setNewApp] = useState({ grantTitle: '', grantId: '', notes: '', deadline: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('t4g_applications') || '[]');
    setApps(stored);
  }, []);

  const save = (updated: TrackedApp[]) => {
    setApps(updated);
    localStorage.setItem('t4g_applications', JSON.stringify(updated));
  };

  const addApp = () => {
    if (!newApp.grantTitle.trim()) return;
    const app: TrackedApp = {
      id: Date.now().toString(),
      grantTitle: newApp.grantTitle,
      grantId: newApp.grantId,
      status: 'researching',
      notes: newApp.notes,
      deadline: newApp.deadline,
      createdAt: new Date().toISOString(),
    };
    save([...apps, app]);
    setNewApp({ grantTitle: '', grantId: '', notes: '', deadline: '' });
    setShowAdd(false);
  };

  const updateStatus = (id: string, status: string) => {
    save(apps.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const updateNotes = (id: string, notes: string) => {
    save(apps.map((a) => (a.id === id ? { ...a, notes } : a)));
  };

  const removeApp = (id: string) => {
    save(apps.filter((a) => a.id !== id));
  };

  const getStatusInfo = (status: string) =>
    STATUS_PIPELINE.find((s) => s.key === status) || STATUS_PIPELINE[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Application Tracker</h1>
          <p className="text-gray-600 text-sm mt-1">
            Track your grant applications from research to submission.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Application
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Track New Application</h3>
            <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Grant title *"
              value={newApp.grantTitle}
              onChange={(e) => setNewApp({ ...newApp, grantTitle: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Grant ID / Opportunity #"
              value={newApp.grantId}
              onChange={(e) => setNewApp({ ...newApp, grantId: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              placeholder="Deadline"
              value={newApp.deadline}
              onChange={(e) => setNewApp({ ...newApp, deadline: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Notes"
              value={newApp.notes}
              onChange={(e) => setNewApp({ ...newApp, notes: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={1}
            />
          </div>
          <button
            onClick={addApp}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Add to Tracker
          </button>
        </div>
      )}

      {/* Pipeline view */}
      {apps.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ClipboardList size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No tracked applications</p>
          <p className="text-sm mt-1">
            Add grants you're applying for to track their progress.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => {
            const si = getStatusInfo(app.status);
            const currentIdx = STATUS_PIPELINE.findIndex((s) => s.key === app.status);
            return (
              <div
                key={app.id}
                className="bg-white border border-gray-200 rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">{app.grantTitle}</h3>
                    {app.grantId && (
                      <p className="text-xs text-gray-500 mt-0.5">#{app.grantId}</p>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${si.color}`}>
                    {si.label}
                  </span>
                </div>

                {/* Status pipeline buttons */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {STATUS_PIPELINE.map((s, i) => (
                    <button
                      key={s.key}
                      onClick={() => updateStatus(app.id, s.key)}
                      className={`flex items-center gap-0.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                        s.key === app.status
                          ? s.color
                          : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                      }`}
                    >
                      {s.label}
                      {i < STATUS_PIPELINE.length - 1 && (
                        <ChevronRight size={10} className="ml-0.5 text-gray-300" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Notes */}
                {editingId === app.id ? (
                  <textarea
                    value={app.notes}
                    onChange={(e) => updateNotes(app.id, e.target.value)}
                    onBlur={() => setEditingId(null)}
                    className="w-full mt-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    autoFocus
                  />
                ) : (
                  <p
                    className="text-sm text-gray-500 mt-2 cursor-pointer hover:text-gray-700"
                    onClick={() => setEditingId(app.id)}
                  >
                    {app.notes || 'Click to add notes...'}
                  </p>
                )}

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                  {app.deadline && (
                    <span className="text-xs text-gray-500">
                      Deadline: {new Date(app.deadline).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => removeApp(app.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
