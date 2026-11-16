import React, { useState, useEffect } from 'react';
import { 
  CalendarDays, 
  PlusCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Lock, 
  Send, 
  ShieldCheck, 
  History, 
  UserCheck, 
  AlertCircle,
  FileCheck,
  Sparkles,
  Layers
} from 'lucide-react';
import { 
  fetchWeeklyReports, 
  fetchWeeklyReportById, 
  createWeeklyReportApi, 
  submitDepartmentalInputApi, 
  submitWeeklyReportApi, 
  reviewWeeklyReportApi, 
  publishWeeklyReportApi,
  type WeeklyReportSummary, 
  type WeeklyReportDetail, 
  type UserProfile 
} from '../../services/api';

interface WeeklyInsightsViewProps {
  siteId: string;
  currentUser: UserProfile | null;
}

export const WeeklyInsightsView: React.FC<WeeklyInsightsViewProps> = ({ siteId, currentUser }) => {
  const [reports, setReports] = useState<WeeklyReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<WeeklyReportDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showDeptModal, setShowDeptModal] = useState<boolean>(false);
  const [deptType, setDeptType] = useState<'SAFETY' | 'QUALITY'>('SAFETY');
  const [deptNarrative, setDeptNarrative] = useState<string>('');
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewDecision, setReviewDecision] = useState<'FLAGGED' | 'VALIDATED'>('VALIDATED');
  const [reviewDiscrepancies, setReviewDiscrepancies] = useState<string>('');
  const [reviewActionItems, setReviewActionItems] = useState<string>('');

  // Form state for creating report
  const [newWeekCode, setNewWeekCode] = useState<string>('2026-W44');
  const [newSummary, setNewSummary] = useState<string>('');
  const [newAchievements, setNewAchievements] = useState<string>('');
  const [newConcerns, setNewConcerns] = useState<string>('');
  const [newAssistance, setNewAssistance] = useState<string>('');

  const effectiveSiteId = siteId === 'ALL' ? 'CS-PUN-01' : siteId;

  // Role permissions. Organization Admins are strictly read-only on weekly reports aside from
  // the final publication lock: they do not draft, submit, review, or add departmental input.
  const isSiteManager = currentUser?.roles.includes('SITE_MANAGER') ?? false;
  const isController = currentUser?.roles.includes('PROJECT_CONTROLLER') ?? false;
  const isOrgAdmin = currentUser?.roles.includes('ORG_ADMIN') ?? false;
  const isSafetyOfficer = currentUser?.roles.includes('SAFETY_OFFICER') ?? false;
  const isQualityOfficer = currentUser?.roles.includes('QUALITY_OFFICER') ?? false;

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWeeklyReports(siteId === 'ALL' ? undefined : siteId);
      setReports(data);
      if (data.length > 0) {
        setSelectedReportId(data[0].id);
      } else {
        setSelectedReportId(null);
        setReportDetail(null);
      }
    } catch (err: any) {
      console.error('Error fetching weekly reports:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load weekly reports.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      const detail = await fetchWeeklyReportById(id);
      setReportDetail(detail);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load report detail.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [siteId]);

  useEffect(() => {
    if (selectedReportId) {
      loadDetail(selectedReportId);
    }
  }, [selectedReportId]);

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const today = new Date();
      const startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];

      const newReport = await createWeeklyReportApi({
        site_id: effectiveSiteId,
        week_code: newWeekCode,
        start_date: startDate,
        end_date: endDate,
        executive_summary: newSummary || `Weekly executive synthesis for ${effectiveSiteId} (${newWeekCode}).`,
        top_achievements: newAchievements || 'Core work packages executed according to milestone plan.',
        critical_concerns: newConcerns || 'No critical delay identified.',
        corporate_assistance_needed: newAssistance || 'None required at present.',
        insight_items: []
      });

      setShowCreateModal(false);
      await loadReports();
      setSelectedReportId(newReport.id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to initialize weekly report.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDepartmentInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReportId) return;
    try {
      setActionLoading(true);
      await submitDepartmentalInputApi(selectedReportId, {
        department: deptType,
        narrative: deptNarrative,
        metrics_json: { submitted_by_role: currentUser?.roles[0] || 'OFFICER' }
      });
      setShowDeptModal(false);
      setDeptNarrative('');
      await loadDetail(selectedReportId);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to submit departmental input.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!selectedReportId) return;
    try {
      setActionLoading(true);
      await submitWeeklyReportApi(selectedReportId);
      await loadDetail(selectedReportId);
      await loadReports();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to submit report for review.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReportId) return;
    try {
      setActionLoading(true);
      await reviewWeeklyReportApi(selectedReportId, {
        decision: reviewDecision,
        discrepancies_found: reviewDecision === 'FLAGGED' ? reviewDiscrepancies : undefined,
        action_items: reviewActionItems || undefined
      });
      setShowReviewModal(false);
      setReviewDiscrepancies('');
      setReviewActionItems('');
      await loadDetail(selectedReportId);
      await loadReports();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to submit review.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublishReport = async () => {
    if (!selectedReportId) return;
    try {
      setActionLoading(true);
      await publishWeeklyReportApi(selectedReportId);
      await loadDetail(selectedReportId);
      await loadReports();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to publish and lock report.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1"><Lock className="w-3 h-3" /> Published & Locked</span>;
      case 'VALIDATED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Controller Validated</span>;
      case 'SUBMITTED':
      case 'RESUBMITTED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1"><Clock className="w-3 h-3" /> Under Controller Review</span>;
      case 'FLAGGED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Discrepancy Flagged</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">Draft / Inputs Pending</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-50 text-[#023B77] rounded-lg border border-blue-200">
                <CalendarDays className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">Construction Weekly Insights & Governance</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Multi-stage collaborative synthesis: Field Department Inputs &rarr; Site Manager Consolidation &rarr; Controller Discrepancy Review &rarr; Executive Publication Lock.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isSiteManager && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg shadow-sm transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Initialize Weekly Report
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Main Grid: Left Roster & Right Detail Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Weekly Reports List (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
              <span>Weekly Reports Roster</span>
              <span className="text-slate-600 font-mono font-bold text-[11px]">{reports.length} Reports</span>
            </h3>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Loading weekly reports...
              </div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No weekly reports found for this site. Click "Initialize Weekly Report" to start.
              </div>
            ) : (
              <div className="space-y-2">
                {reports.map((rep) => {
                  const isSelected = rep.id === selectedReportId;
                  return (
                    <div
                      key={rep.id}
                      onClick={() => setSelectedReportId(rep.id)}
                      className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-50/70 border-[#023B77] shadow-sm' 
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-[#023B77]">
                          {rep.week_code}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          v{rep.current_version}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-900 mt-1">{rep.site_name || rep.site_id}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{rep.executive_summary || 'Draft report'}</p>

                      <div className="mt-3 flex items-center justify-between text-[11px]">
                        <div>{getStatusBadge(rep.status)}</div>
                        <span className="text-slate-400">{rep.start_date.slice(5)} to {rep.end_date.slice(5)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Weekly Report Dossier (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {detailLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-400 text-sm">
              Loading report dossier...
            </div>
          ) : !reportDetail ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center text-slate-400 text-sm">
              Select a weekly report from the roster to view details and governance actions.
            </div>
          ) : (
            <>
              {/* Dossier Header & Governance Actions Bar */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-[#023B77] text-white px-2.5 py-0.5 rounded">
                        {reportDetail.site_id} • {reportDetail.week_code}
                      </span>
                      <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                        Version {reportDetail.current_version}
                      </span>
                      {getStatusBadge(reportDetail.status)}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mt-1.5">{reportDetail.site_name}</h3>
                    <p className="text-xs text-slate-500">
                      Period: {reportDetail.start_date} to {reportDetail.end_date} • Submitted by: {reportDetail.site_manager_name || 'Site Manager'}
                    </p>
                  </div>

                  {/* Multi-Stage Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Safety Officer Input */}
                    {(isSafetyOfficer || isSiteManager) && ['DRAFT', 'FLAGGED', 'INPUTS_PENDING'].includes(reportDetail.status) && (
                      <button
                        onClick={() => { setDeptType('SAFETY'); setShowDeptModal(true); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> + Safety Input
                      </button>
                    )}

                    {/* Quality Officer Input */}
                    {(isQualityOfficer || isSiteManager) && ['DRAFT', 'FLAGGED', 'INPUTS_PENDING'].includes(reportDetail.status) && (
                      <button
                        onClick={() => { setDeptType('QUALITY'); setShowDeptModal(true); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg text-xs font-bold transition-colors"
                      >
                        <FileCheck className="w-3.5 h-3.5" /> + Quality Input
                      </button>
                    )}

                    {/* Site Manager Submit to Review */}
                    {isSiteManager && ['DRAFT', 'FLAGGED', 'INPUTS_PENDING'].includes(reportDetail.status) && (
                      <button
                        onClick={handleSubmitReport}
                        disabled={actionLoading}
                        className="flex items-center gap-1 px-3.5 py-1.5 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" /> Submit to Review
                      </button>
                    )}

                    {/* Project Controller Review */}
                    {isController && ['SUBMITTED', 'RESUBMITTED'].includes(reportDetail.status) && (
                      <button
                        onClick={() => setShowReviewModal(true)}
                        className="flex items-center gap-1 px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Review & Validate
                      </button>
                    )}

                    {/* Organization Admin Publication Lock Authority */}
                    {isOrgAdmin && reportDetail.status === 'VALIDATED' && (
                      <button
                        onClick={handlePublishReport}
                        disabled={actionLoading}
                        className="flex items-center gap-1 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                      >
                        <Lock className="w-3.5 h-3.5" /> Publish & Lock Report (Admin)
                      </button>
                    )}
                  </div>
                </div>

                {/* Narrative Sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="font-bold text-[#023B77] uppercase text-[11px] mb-1 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Executive Summary
                    </p>
                    <p className="text-slate-700 leading-relaxed">{reportDetail.executive_summary || 'No summary entered.'}</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="font-bold text-emerald-800 uppercase text-[11px] mb-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Top Achievements
                    </p>
                    <p className="text-slate-700 leading-relaxed">{reportDetail.top_achievements || 'No achievements specified.'}</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="font-bold text-amber-800 uppercase text-[11px] mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Critical Concerns & Delays
                    </p>
                    <p className="text-slate-700 leading-relaxed">{reportDetail.critical_concerns || 'No critical delays reported.'}</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="font-bold text-blue-800 uppercase text-[11px] mb-1 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" /> Corporate Assistance Needed
                    </p>
                    <p className="text-slate-700 leading-relaxed">{reportDetail.corporate_assistance_needed || 'No corporate intervention required.'}</p>
                  </div>
                </div>
              </div>

              {/* Departmental Inputs Grid */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                  <span>Field Department Syntheses</span>
                  <span className="text-slate-400 font-mono text-[11px]">{reportDetail.departmental_inputs.length} Syntheses Attached</span>
                </h4>

                {reportDetail.departmental_inputs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No departmental inputs submitted yet. Safety and Quality Officers can add their inputs above.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reportDetail.departmental_inputs.map((dep) => (
                      <div key={dep.id} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                            dep.department === 'SAFETY' ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'
                          }`}>
                            {dep.department === 'SAFETY' ? '🛡️ Safety Compliance' : '📋 Quality Inspection Review'}
                          </span>
                          <span className="text-[10px] text-slate-400">{new Date(dep.submitted_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed">{dep.narrative}</p>
                        <p className="text-[10px] text-slate-400 mt-2">Author: {dep.author_name || 'Officer'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Discrepancy & Validation Audit Trail */}
              {reportDetail.reviews.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-purple-700" /> Controller Discrepancy & Review History
                  </h4>

                  <div className="space-y-2">
                    {reportDetail.reviews.map((rev) => (
                      <div key={rev.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            rev.decision === 'FLAGGED' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            Decision: {rev.decision}
                          </span>
                          <span className="text-[10px] text-slate-400">Reviewed by {rev.reviewer_name || 'Controller'}</span>
                        </div>

                        {rev.discrepancies_found && (
                          <p className="text-rose-700 mt-1.5 font-medium">
                            <strong>Discrepancies:</strong> {rev.discrepancies_found}
                          </p>
                        )}
                        {rev.action_items && (
                          <p className="text-slate-700 mt-1">
                            <strong>Action Items:</strong> {rev.action_items}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal: Initialize Weekly Report */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-lg w-full p-6 text-xs animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Initialize Weekly Report</h3>
            <p className="text-slate-500 mb-4">Create a new consolidated weekly report draft for {effectiveSiteId}.</p>

            <form onSubmit={handleCreateReport} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Week Code (e.g. 2026-W44)</label>
                <input
                  type="text"
                  required
                  value={newWeekCode}
                  onChange={(e) => setNewWeekCode(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Executive Summary</label>
                <textarea
                  rows={2}
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="Key milestones, overall site momentum..."
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Top Achievements</label>
                <textarea
                  rows={2}
                  value={newAchievements}
                  onChange={(e) => setNewAchievements(e.target.value)}
                  placeholder="Major pours, inspections passed, critical path wins..."
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Critical Concerns & Bottlenecks</label>
                <textarea
                  rows={2}
                  value={newConcerns}
                  onChange={(e) => setNewConcerns(e.target.value)}
                  placeholder="Delayed procurement, logistics holds, manpower shortfall..."
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Corporate Assistance Needed</label>
                <textarea
                  rows={2}
                  value={newAssistance}
                  onChange={(e) => setNewAssistance(e.target.value)}
                  placeholder="Intervention required from corporate leadership..."
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-[#023B77] text-white rounded-lg font-bold hover:bg-[#012d5a] disabled:opacity-50"
                >
                  {actionLoading ? 'Initializing...' : 'Create Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Departmental Input */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-md w-full p-6 text-xs animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Submit {deptType === 'SAFETY' ? 'Safety' : 'Quality'} Departmental Input
            </h3>
            <p className="text-slate-500 mb-4">
              {deptType === 'SAFETY' 
                ? 'Synthesize verified safety inspections, incident logs, and hazard mitigation reports.' 
                : 'Synthesize quality checklist results, defects, and NCR status.'}
            </p>

            <form onSubmit={handleDepartmentInputSubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Department Narrative Synthesis</label>
                <textarea
                  required
                  rows={4}
                  value={deptNarrative}
                  onChange={(e) => setDeptNarrative(e.target.value)}
                  placeholder={`Enter official ${deptType.toLowerCase()} weekly observations...`}
                  className="w-full p-2.5 border border-slate-200 rounded-lg outline-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-[#023B77] text-white rounded-lg font-bold hover:bg-[#012d5a] disabled:opacity-50"
                >
                  {actionLoading ? 'Submitting...' : 'Submit Input'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Controller Review */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-md w-full p-6 text-xs animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Project Controller Review</h3>
            <p className="text-slate-500 mb-4">Validate reported figures against daily report data or flag discrepancies for correction.</p>

            <form onSubmit={handleReviewReport} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Review Decision</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="decision"
                      value="VALIDATED"
                      checked={reviewDecision === 'VALIDATED'}
                      onChange={() => setReviewDecision('VALIDATED')}
                    />
                    Validate (Forward to Executive)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-rose-700">
                    <input
                      type="radio"
                      name="decision"
                      value="FLAGGED"
                      checked={reviewDecision === 'FLAGGED'}
                      onChange={() => setReviewDecision('FLAGGED')}
                    />
                    Flag Discrepancy (Require Resubmission)
                  </label>
                </div>
              </div>

              {reviewDecision === 'FLAGGED' && (
                <div>
                  <label className="block font-bold text-rose-800 mb-1">Discrepancy Details</label>
                  <textarea
                    required
                    rows={3}
                    value={reviewDiscrepancies}
                    onChange={(e) => setReviewDiscrepancies(e.target.value)}
                    placeholder="Specify mismatched quantities, budget discrepancies, or unverified claims..."
                    className="w-full p-2 border border-rose-200 rounded-lg outline-none bg-rose-50/50 text-slate-800"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Controller Action Items & Instructions</label>
                <textarea
                  rows={2}
                  value={reviewActionItems}
                  onChange={(e) => setReviewActionItems(e.target.value)}
                  placeholder="Next steps, required reconciliation..."
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-purple-700 text-white rounded-lg font-bold hover:bg-purple-800 disabled:opacity-50"
                >
                  {actionLoading ? 'Recording...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
