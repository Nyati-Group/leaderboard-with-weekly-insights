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
  AlertTriangle,
  Plus,
  Trash2,
  X,
  Save
} from 'lucide-react';
import { 
  fetchDailyReports, 
  fetchDailyReportDetail, 
  submitDailyReport,
  fetchReportVersions,
  createDailyReportApi,
  type DailyReportSummary, 
  type DailyReportDetail,
  type VersionSnapshot,
  type UserProfile
} from '../../services/api';

interface FieldOperationsViewProps {
  siteId: string;
  currentUser: UserProfile;
}

const SITE_OPTIONS = [
  { id: 'CS-PUN-01', name: 'Pune Commercial Tower' },
  { id: 'CS-MUM-02', name: 'Mumbai Residential Complex' },
  { id: 'CS-NAS-03', name: 'Nashik Industrial Facility' },
  { id: 'CS-REM-04', name: 'Remote Infrastructure Project' },
  { id: 'CS-NAG-05', name: 'Nagpur Mixed-Use' },
];

export const FieldOperationsView: React.FC<FieldOperationsViewProps> = ({ siteId, currentUser }) => {
  const [reports, setReports] = useState<DailyReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<DailyReportDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'progress' | 'manpower' | 'expenditure' | 'activities'>('progress');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Daily Report Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalTab, setModalTab] = useState<'overview' | 'progress' | 'manpower' | 'expenditure' | 'tasks'>('overview');
  const [formSiteId, setFormSiteId] = useState<string>(siteId !== 'ALL' ? siteId : 'CS-PUN-01');
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formRemarks, setFormRemarks] = useState<string>('');
  
  const [formProgress, setFormProgress] = useState([
    { work_package: 'Superstructure', activity_name: 'RCC Slab Level 4 Concrete Casting', unit_of_measure: 'm3', planned_quantity: 45, actual_quantity: 42, cumulative_quantity: 320, notes: 'Slump test compliant' }
  ]);
  
  const [formManpower, setFormManpower] = useState([
    { trade_category: 'Carpenters & Shuttering', contractor_name: 'Apex Formwork Ltd', planned_count: 24, actual_count: 22, overtime_hours: 2 },
    { trade_category: 'Rebar Steel Fixers', contractor_name: 'Precision Steel Co', planned_count: 18, actual_count: 18, overtime_hours: 1.5 }
  ]);

  const [formExpenditure, setFormExpenditure] = useState([
    { cost_code: 'MAT-CONC-01', category: 'Concrete & ReadyMix', planned_amount: 280000, actual_amount: 275000, vendor_name: 'Ultratech ReadyMix', invoice_ref: 'INV-2026-881' }
  ]);

  const [formActivities, setFormActivities] = useState([
    { name: 'Level 4 Slab Reinforcement & Pre-Pour Checklist', status: 'COMPLETED', blockers: '', mitigation_steps: '' }
  ]);

  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Load list of reports
  useEffect(() => {
    loadReports();
    if (siteId !== 'ALL') {
      setFormSiteId(siteId);
    }
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
      setStatusMessage('Report submitted successfully! Version snapshot archived.');
      await loadReports();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Submission failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setModalSubmitting(true);
      const payload = {
        site_id: formSiteId,
        reporting_date: formDate,
        site_manager_remarks: formRemarks.trim() || undefined,
        progress_records: formProgress.map(p => ({
          ...p,
          planned_quantity: Number(p.planned_quantity),
          actual_quantity: Number(p.actual_quantity),
          cumulative_quantity: Number(p.cumulative_quantity || 0)
        })),
        manpower_records: formManpower.map(m => ({
          ...m,
          planned_count: Number(m.planned_count),
          actual_count: Number(m.actual_count),
          overtime_hours: Number(m.overtime_hours || 0)
        })),
        expenditure_records: formExpenditure.map(x => ({
          ...x,
          planned_amount: Number(x.planned_amount),
          actual_amount: Number(x.actual_amount)
        })),
        activity_records: formActivities
      };

      const result = await createDailyReportApi(payload);
      setShowCreateModal(false);
      setStatusMessage(`Daily Report for ${result.reporting_date} saved successfully (Status: ${result.status})`);
      await loadReports();
      setSelectedReportId(result.id);
      loadDetail(result.id);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save daily report');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Permission check: Site Managers, Org Admins, Project Controllers can log daily field records
  const userRoles = currentUser?.roles || [];
  const canCreateReport = userRoles.includes('SITE_MANAGER') || 
                          userRoles.includes('ORG_ADMIN') || 
                          userRoles.includes('PROJECT_CONTROLLER') ||
                          currentUser?.has_global_scope;

  const canEdit = reportDetail && (reportDetail.status === 'DRAFT' || reportDetail.status === 'FLAGGED');

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
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
          {canCreateReport && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#023B77] hover:bg-[#012d5a] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Log Daily Report</span>
            </button>
          )}

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
              className="px-4 py-1.5 rounded-lg bg-[#039583] hover:bg-[#027466] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
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
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-4 h-[600px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
              Reports by Date
            </p>
            {canCreateReport && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-[11px] text-[#023B77] font-bold hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            )}
          </div>

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
                    <span className="font-mono text-slate-800 font-bold">{r.reporting_date}</span>
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
                    <span className="font-mono">{r.site_id}</span>
                  </div>
                </div>
              );
            })}

            {!loading && reports.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs flex flex-col items-center">
                <Calendar className="w-8 h-8 text-slate-300 mb-2" />
                <p>No daily reports found for this site.</p>
                {canCreateReport && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-[#023B77] text-white text-xs font-semibold hover:bg-[#012d5a] transition-all"
                  >
                    + Log Daily Report
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Report Details & Child Tabs */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col h-[600px] overflow-hidden">
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
                  className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === 'progress' 
                      ? 'border-[#039583] text-[#023B77] font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Progress ({reportDetail.progress_records.length})
                </button>

                <button
                  onClick={() => setActiveTab('manpower')}
                  className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === 'manpower' 
                      ? 'border-[#039583] text-[#023B77] font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> Manpower ({reportDetail.manpower_records.length})
                </button>

                <button
                  onClick={() => setActiveTab('expenditure')}
                  className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === 'expenditure' 
                      ? 'border-[#039583] text-[#023B77] font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <IndianRupee className="w-3.5 h-3.5" /> Expenditure ({reportDetail.expenditure_records.length})
                </button>

                <button
                  onClick={() => setActiveTab('activities')}
                  className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === 'activities' 
                      ? 'border-[#039583] text-[#023B77] font-bold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Tasks & Blockers ({reportDetail.activity_records.length})
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

      {/* Apple-styled Modal: Log New Daily Report */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#023B77]" />
                  Log Daily Field Report (DPR)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record on-site progress, contractor census, and daily project spend.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Segmented Sub-Navigation */}
            <div className="px-5 pt-3 pb-2 border-b border-slate-100 bg-white flex items-center gap-2 text-xs">
              {[
                { id: 'overview', label: '1. Summary & Date' },
                { id: 'progress', label: `2. Progress (${formProgress.length})` },
                { id: 'manpower', label: `3. Manpower (${formManpower.length})` },
                { id: 'expenditure', label: `4. Expenditure (${formExpenditure.length})` },
                { id: 'tasks', label: `5. Tasks (${formActivities.length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModalTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    modalTab === tab.id
                      ? 'bg-[#023B77] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleCreateReport} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              
              {/* TAB 1: OVERVIEW */}
              {modalTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Target Site</label>
                      <select
                        value={formSiteId}
                        onChange={(e) => setFormSiteId(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-medium"
                      >
                        {SITE_OPTIONS.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Reporting Date</label>
                      <input
                        type="date"
                        required
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Site Manager Executive Remarks</label>
                    <textarea
                      rows={4}
                      value={formRemarks}
                      onChange={(e) => setFormRemarks(e.target.value)}
                      placeholder="Enter daily site log narrative, weather conditions, shift summary, or critical notes..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: PROGRESS */}
              {modalTab === 'progress' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">Physical Work Package Items</span>
                    <button
                      type="button"
                      onClick={() => setFormProgress(prev => [
                        ...prev,
                        { work_package: 'Substructure', activity_name: 'Excavation & Shoring', unit_of_measure: 'm3', planned_quantity: 30, actual_quantity: 30, cumulative_quantity: 150, notes: '' }
                      ])}
                      className="text-xs font-bold text-[#023B77] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Progress Row
                    </button>
                  </div>

                  {formProgress.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-[11px]">Item #{idx + 1}</span>
                        {formProgress.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFormProgress(prev => prev.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Work Package (e.g. Superstructure)"
                          value={item.work_package}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormProgress(prev => prev.map((p, i) => i === idx ? { ...p, work_package: val } : p));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Activity Name"
                          value={item.activity_name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormProgress(prev => prev.map((p, i) => i === idx ? { ...p, activity_name: val } : p));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Unit (m3, MT, %)"
                          value={item.unit_of_measure}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormProgress(prev => prev.map((p, i) => i === idx ? { ...p, unit_of_measure: val } : p));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                        <input
                          type="number"
                          placeholder="Planned Qty"
                          value={item.planned_quantity}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFormProgress(prev => prev.map((p, i) => i === idx ? { ...p, planned_quantity: val } : p));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                        <input
                          type="number"
                          placeholder="Actual Qty"
                          value={item.actual_quantity}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFormProgress(prev => prev.map((p, i) => i === idx ? { ...p, actual_quantity: val } : p));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: MANPOWER */}
              {modalTab === 'manpower' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">Contractor Manpower Census</span>
                    <button
                      type="button"
                      onClick={() => setFormManpower(prev => [
                        ...prev,
                        { trade_category: 'General Civil Labor', contractor_name: 'Metro Infra Services', planned_count: 20, actual_count: 19, overtime_hours: 0 }
                      ])}
                      className="text-xs font-bold text-[#023B77] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Trade Row
                    </button>
                  </div>

                  {formManpower.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-[11px]">Trade Group #{idx + 1}</span>
                        {formManpower.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFormManpower(prev => prev.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Trade Category (e.g. Masons)"
                          value={item.trade_category}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormManpower(prev => prev.map((m, i) => i === idx ? { ...m, trade_category: val } : m));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Subcontractor Name"
                          value={item.contractor_name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormManpower(prev => prev.map((m, i) => i === idx ? { ...m, contractor_name: val } : m));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          placeholder="Planned Count"
                          value={item.planned_count}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFormManpower(prev => prev.map((m, i) => i === idx ? { ...m, planned_count: val } : m));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                        <input
                          type="number"
                          placeholder="Actual Count"
                          value={item.actual_count}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFormManpower(prev => prev.map((m, i) => i === idx ? { ...m, actual_count: val } : m));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                        <input
                          type="number"
                          placeholder="Overtime (Hours)"
                          value={item.overtime_hours}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFormManpower(prev => prev.map((m, i) => i === idx ? { ...m, overtime_hours: val } : m));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 4: EXPENDITURE */}
              {modalTab === 'expenditure' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">Daily Project Expenditure</span>
                    <button
                      type="button"
                      onClick={() => setFormExpenditure(prev => [
                        ...prev,
                        { cost_code: 'EQP-CRN-01', category: 'Heavy Equipment Rental', planned_amount: 45000, actual_amount: 45000, vendor_name: 'Sanghvi Cranes', invoice_ref: '' }
                      ])}
                      className="text-xs font-bold text-[#023B77] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Cost Row
                    </button>
                  </div>

                  {formExpenditure.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-[11px]">Cost Code #{idx + 1}</span>
                        {formExpenditure.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFormExpenditure(prev => prev.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Cost Code (e.g. MAT-CONC-01)"
                          value={item.cost_code}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormExpenditure(prev => prev.map((x, i) => i === idx ? { ...x, cost_code: val } : x));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs font-mono"
                          required
                        />
                        <input
                          type="text"
                          placeholder="Category (Materials, Equipment)"
                          value={item.category}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormExpenditure(prev => prev.map((x, i) => i === idx ? { ...x, category: val } : x));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Planned Spend (₹)"
                          value={item.planned_amount}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFormExpenditure(prev => prev.map((x, i) => i === idx ? { ...x, planned_amount: val } : x));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                        <input
                          type="number"
                          placeholder="Actual Spend (₹)"
                          value={item.actual_amount}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFormExpenditure(prev => prev.map((x, i) => i === idx ? { ...x, actual_amount: val } : x));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs font-bold text-emerald-700"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Vendor Name"
                          value={item.vendor_name || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormExpenditure(prev => prev.map((x, i) => i === idx ? { ...x, vendor_name: val } : x));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Invoice Reference"
                          value={item.invoice_ref || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormExpenditure(prev => prev.map((x, i) => i === idx ? { ...x, invoice_ref: val } : x));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 5: TASKS & BLOCKERS */}
              {modalTab === 'tasks' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">Tasks & Operational Blockers</span>
                    <button
                      type="button"
                      onClick={() => setFormActivities(prev => [
                        ...prev,
                        { name: 'Electrical Conduit Routing', status: 'IN_PROGRESS', blockers: '', mitigation_steps: '' }
                      ])}
                      className="text-xs font-bold text-[#023B77] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Task
                    </button>
                  </div>

                  {formActivities.map((act, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-[11px]">Task #{idx + 1}</span>
                        {formActivities.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFormActivities(prev => prev.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Activity / Task Description"
                          value={act.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormActivities(prev => prev.map((a, i) => i === idx ? { ...a, name: val } : a));
                          }}
                          className="col-span-2 p-2 border border-slate-200 rounded-lg text-xs"
                          required
                        />
                        <select
                          value={act.status}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormActivities(prev => prev.map((a, i) => i === idx ? { ...a, status: val } : a));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs font-bold"
                        >
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="DELAYED">DELAYED</option>
                          <option value="BLOCKED">BLOCKED</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Blocker / Hold reason (optional)"
                          value={act.blockers || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormActivities(prev => prev.map((a, i) => i === idx ? { ...a, blockers: val } : a));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Mitigation steps taken"
                          value={act.mitigation_steps || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormActivities(prev => prev.map((a, i) => i === idx ? { ...a, mitigation_steps: val } : a));
                          }}
                          className="p-2 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">
                  Saves as DRAFT with immediate version tracking.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSubmitting}
                    className="px-5 py-2 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg font-bold flex items-center gap-1.5 shadow-sm active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{modalSubmitting ? 'Saving...' : 'Save Draft Report'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
