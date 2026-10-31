import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CheckCircle2, 
  History, 
  Send, 
  Layers, 
  Users, 
  IndianRupee, 
  FileText,
  AlertTriangle
} from 'lucide-react';
import { 
  fetchDailyReports, 
  fetchDailyReportDetail, 
  submitDailyReport,
  fetchReportVersions,
  type DailyReportSummary, 
  type DailyReportDetail,
  type VersionSnapshot,
  type UserProfile
} from '../../services/api';

interface FieldOperationsViewProps {
  siteId: string;
  currentUser: UserProfile;
}

export const FieldOperationsView: React.FC<FieldOperationsViewProps> = ({ siteId, currentUser: _currentUser }) => {
  const [reports, setReports] = useState<DailyReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<DailyReportDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'progress' | 'manpower' | 'expenditure' | 'activities'>('progress');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load list of reports
  useEffect(() => {
    loadReports();
  }, [siteId]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await fetchDailyReports(siteId);
      setReports(data);
      if (data.length > 0) {
        setSelectedReportId(data[0].id);
        loadDetail(data[0].id);
      } else {
        setSelectedReportId(null);
        setReportDetail(null);
      }
    } catch (err: any) {
      console.error('Failed to load daily reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const detail = await fetchDailyReportDetail(id);
      setReportDetail(detail);
      const vData = await fetchReportVersions(id);
      setVersions(vData);
    } catch (err) {
      console.error('Failed to load report details:', err);
    }
  };

  const handleSelectReport = (id: string) => {
    setSelectedReportId(id);
    loadDetail(id);
  };

  const handleSubmit = async () => {
    if (!selectedReportId) return;
    try {
      setActionLoading(true);
      const updated = await submitDailyReport(selectedReportId);
      setReportDetail(updated);
      setStatusMessage('Report submitted successfully! Snapshot archived.');
      await loadReports();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Submission failed');
    } finally {
      setActionLoading(false);
    }
  };

  const canEdit = reportDetail && (reportDetail.status === 'DRAFT' || reportDetail.status === 'FLAGGED');

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#023B77]" />
            Daily Field Operations & Activity Ledger
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Site: <span className="font-mono font-bold text-[#023B77]">{siteId}</span> • Immutable version-controlled field reporting
          </p>
        </div>

        <div className="flex items-center gap-2">
          {reportDetail && (
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-all"
            >
              <History className="w-4 h-4 text-slate-500" />
              <span>Versions ({versions.length})</span>
            </button>
          )}

          {canEdit && (
            <button
              onClick={handleSubmit}
              disabled={actionLoading}
              className="px-4 py-1.5 rounded-lg bg-[#039583] hover:bg-[#027466] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{actionLoading ? 'Archiving...' : 'Submit Report'}</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {statusMessage}
          </span>
          <button onClick={() => setStatusMessage(null)} className="text-emerald-900 font-bold">✕</button>
        </div>
      )}

      {/* Main reporting workspace grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column: Historical Dates Roster */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 h-[600px] flex flex-col">
          <p className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">
            Reports by Date
          </p>

          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {loading && <div className="text-center py-4 text-xs text-slate-400">Loading records...</div>}
            {!loading && reports.map((r) => {
              const isSelected = r.id === selectedReportId;
              return (
                <div
                  key={r.id}
                  onClick={() => handleSelectReport(r.id)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-[#039583] bg-teal-50/50 shadow-sm font-semibold' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-slate-800">{r.reporting_date}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      r.status === 'VALIDATED' 
                        ? 'bg-emerald-100 text-emerald-800'
                        : r.status === 'SUBMITTED'
                          ? 'bg-blue-100 text-blue-800'
                          : r.status === 'FLAGGED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>v{r.current_version}</span>
                    <span>{r.site_id}</span>
                  </div>
                </div>
              );
            })}

            {reports.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs">
                No daily reports found for this site.
              </div>
            )}
          </div>
        </div>

        {/* Right column: Report Details & Child Tabs */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[600px] overflow-hidden">
          {reportDetail ? (
            <>
              {/* Report Header Metadata */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-900 font-mono flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#023B77]" /> {reportDetail.reporting_date}
                    </span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                      reportDetail.status === 'VALIDATED' 
                        ? 'bg-emerald-100 text-emerald-800'
                        : reportDetail.status === 'SUBMITTED'
                          ? 'bg-blue-100 text-blue-800'
                          : reportDetail.status === 'FLAGGED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-800'
                    }`}>
                      Status: {reportDetail.status}
                    </span>
                    <span className="text-xs bg-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded">
                      Version {reportDetail.current_version}
                    </span>
                  </div>
                  {reportDetail.site_manager_remarks && (
                    <p className="text-xs text-slate-600 mt-1 italic">
                      "{reportDetail.site_manager_remarks}"
                    </p>
                  )}
                  {reportDetail.flagged_reason && (
                    <p className="text-xs text-amber-700 font-semibold mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Discrepancy Flag: {reportDetail.flagged_reason}
                    </p>
                  )}
                </div>
              </div>

              {/* Sub-Tabs Navigation */}
              <div className="flex border-b border-slate-200 bg-white px-4 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('progress')}
                  className={`py-3 px-4 border-b-2 flex items-center gap-1.5 ${
                    activeTab === 'progress' 
                      ? 'border-[#039583] text-[#023B77] font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Progress ({reportDetail.progress_records.length})
                </button>

                <button
                  onClick={() => setActiveTab('manpower')}
                  className={`py-3 px-4 border-b-2 flex items-center gap-1.5 ${
                    activeTab === 'manpower' 
                      ? 'border-[#039583] text-[#023B77] font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> Manpower ({reportDetail.manpower_records.length})
                </button>

                <button
                  onClick={() => setActiveTab('expenditure')}
                  className={`py-3 px-4 border-b-2 flex items-center gap-1.5 ${
                    activeTab === 'expenditure' 
                      ? 'border-[#039583] text-[#023B77] font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <IndianRupee className="w-3.5 h-3.5" /> Expenditure ({reportDetail.expenditure_records.length})
                </button>

                <button
                  onClick={() => setActiveTab('activities')}
                  className={`py-3 px-4 border-b-2 flex items-center gap-1.5 ${
                    activeTab === 'activities' 
                      ? 'border-[#039583] text-[#023B77] font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Blockers & Tasks ({reportDetail.activity_records.length})
                </button>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'progress' && (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase">
                        <th className="pb-2">Work Package</th>
                        <th className="pb-2">Activity</th>
                        <th className="pb-2">Unit</th>
                        <th className="pb-2 text-right">Planned Qty</th>
                        <th className="pb-2 text-right">Actual Qty</th>
                        <th className="pb-2 text-right">Cumulative</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportDetail.progress_records.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 font-semibold text-slate-800">{p.work_package}</td>
                          <td className="py-2.5 text-slate-700">{p.activity_name}</td>
                          <td className="py-2.5 text-slate-500 font-mono">{p.unit_of_measure}</td>
                          <td className="py-2.5 text-right font-mono">{p.planned_quantity}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-[#039583]">{p.actual_quantity}</td>
                          <td className="py-2.5 text-right font-mono text-slate-600">{p.cumulative_quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === 'manpower' && (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase">
                        <th className="pb-2">Trade Category</th>
                        <th className="pb-2">Subcontractor</th>
                        <th className="pb-2 text-right">Planned Count</th>
                        <th className="pb-2 text-right">Actual Count</th>
                        <th className="pb-2 text-right">Overtime (Hrs)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportDetail.manpower_records.map((m, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 font-semibold text-slate-800">{m.trade_category}</td>
                          <td className="py-2.5 text-slate-600">{m.contractor_name}</td>
                          <td className="py-2.5 text-right font-mono">{m.planned_count}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-[#023B77]">{m.actual_count}</td>
                          <td className="py-2.5 text-right font-mono text-slate-600">{m.overtime_hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === 'expenditure' && (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase">
                        <th className="pb-2">Cost Code</th>
                        <th className="pb-2">Category</th>
                        <th className="pb-2">Vendor / Invoice</th>
                        <th className="pb-2 text-right">Planned (₹)</th>
                        <th className="pb-2 text-right">Actual Spend (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportDetail.expenditure_records.map((e, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 font-mono font-semibold text-slate-800">{e.cost_code}</td>
                          <td className="py-2.5 text-slate-600">{e.category}</td>
                          <td className="py-2.5 text-slate-500">{e.vendor_name || 'N/A'} {e.invoice_ref ? `(${e.invoice_ref})` : ''}</td>
                          <td className="py-2.5 text-right font-mono">₹{e.planned_amount.toLocaleString()}</td>
                          <td className="py-2.5 text-right font-mono font-bold text-emerald-700">₹{e.actual_amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === 'activities' && (
                  <div className="space-y-3">
                    {reportDetail.activity_records.map((a, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-900">{a.name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            a.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {a.status}
                          </span>
                        </div>
                        {a.blockers && (
                          <p className="text-red-700 font-semibold mt-1">
                            Blocker: {a.blockers}
                          </p>
                        )}
                        {a.mitigation_steps && (
                          <p className="text-slate-600 mt-0.5">
                            Mitigation: {a.mitigation_steps}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">
              Select a reporting date from the list to view operational records.
            </div>
          )}
        </div>
      </div>

      {/* Version History Drawer */}
      {showVersions && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mt-4">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <h4 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
              <History className="w-4 h-4 text-[#023B77]" /> Immutable Snapshot History
            </h4>
            <button onClick={() => setShowVersions(false)} className="text-slate-400 hover:text-slate-700 text-xs">✕</button>
          </div>

          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#023B77]">Version {v.version_number}</span>
                  <p className="text-slate-500 text-[11px] mt-0.5">{v.change_summary || 'Standard daily snapshot'}</p>
                </div>
                <div className="text-right text-[10px] text-slate-400 font-mono">
                  {new Date(v.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
