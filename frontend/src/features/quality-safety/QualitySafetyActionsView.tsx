import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  AlertOctagon,
  Activity,
  AlertCircle,
  PlusCircle,
  X,
  Trash2,
  Eye,
  ClipboardList
} from 'lucide-react';
import {
  fetchQualityInspections,
  fetchNCRs,
  createQualityInspectionApi,
  issueNcrApi,
  closeNcrApi,
  fetchSafetyInspections,
  fetchSafetyObservations,
  fetchSafetyIncidents,
  createSafetyInspectionApi,
  fetchCorrectiveActions,
  updateActionStatusApi,
  createCorrectiveActionApi,
  type QualityInspection,
  type NCRRecord,
  type SafetyInspection,
  type SafetyObservation,
  type SafetyIncident,
  type CorrectiveActionItem,
  type UserProfile
} from '../../services/api';

interface QualitySafetyActionsViewProps {
  siteId: string;
  currentUser: UserProfile;
}

// Mirrors the backend's ACTION_RESPONSIBLE_ROLES: whoever owns the underlying finding
// drives it to closure; Site Manager and Project Controller can act on any source type.
const ACTION_RESPONSIBLE_ROLES: Record<string, string[]> = {
  SAFETY_INCIDENT: ['SAFETY_OFFICER', 'SITE_MANAGER', 'PROJECT_CONTROLLER'],
  SAFETY_OBSERVATION: ['SAFETY_OFFICER', 'SITE_MANAGER', 'PROJECT_CONTROLLER'],
  QUALITY_NCR: ['QUALITY_OFFICER', 'SITE_MANAGER', 'PROJECT_CONTROLLER'],
  AUDIT_FINDING: ['PROJECT_CONTROLLER', 'SITE_MANAGER'],
  MANUAL: ['SITE_MANAGER', 'SAFETY_OFFICER', 'QUALITY_OFFICER', 'PROJECT_CONTROLLER'],
};
const DEFAULT_ACTION_ROLES = ['SITE_MANAGER', 'PROJECT_CONTROLLER'];

const SOURCE_TYPE_LABELS: Record<string, string> = {
  SAFETY_INCIDENT: 'Safety Incident',
  SAFETY_OBSERVATION: 'Safety Observation',
  QUALITY_NCR: 'Quality NCR',
  AUDIT_FINDING: 'Audit Finding',
  MANUAL: 'Manual / Other',
};

export const QualitySafetyActionsView: React.FC<QualitySafetyActionsViewProps> = ({ siteId, currentUser }) => {
  const [activeSection, setActiveSection] = useState<'quality' | 'safety' | 'actions'>('quality');
  const [qualityInspections, setQualityInspections] = useState<QualityInspection[]>([]);
  const [ncrs, setNcrs] = useState<NCRRecord[]>([]);
  const [safetyInspections, setSafetyInspections] = useState<SafetyInspection[]>([]);
  const [safetyObservations, setSafetyObservations] = useState<SafetyObservation[]>([]);
  const [safetyIncidents, setSafetyIncidents] = useState<SafetyIncident[]>([]);
  const [actions, setActions] = useState<CorrectiveActionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Raise Issue modal state
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [raising, setRaising] = useState(false);
  const [raiseError, setRaiseError] = useState<string | null>(null);
  const allowedSourceTypes = Object.keys(ACTION_RESPONSIBLE_ROLES).filter(st =>
    ACTION_RESPONSIBLE_ROLES[st].some(r => currentUser.roles.includes(r))
  );
  const canRaiseIssue = allowedSourceTypes.length > 0;
  const effectiveSiteId = siteId !== 'ALL' ? siteId : (currentUser.assigned_site_ids[0] || 'CS-PUN-01');
  const [raiseForm, setRaiseForm] = useState({
    source_type: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  // Only Quality Officers and Project Controllers may log quality inspections / issue or close
  // NCRs; only Safety Officers and Project Controllers may log safety audits — mirrors the
  // backend's require_roles() gates on POST /quality/inspections, /quality/ncrs, /safety/inspections.
  const canWriteQuality = currentUser.roles.some(r => ['QUALITY_OFFICER', 'PROJECT_CONTROLLER'].includes(r));
  const canWriteSafety = currentUser.roles.some(r => ['SAFETY_OFFICER', 'PROJECT_CONTROLLER'].includes(r));

  // Quality Inspection modal state
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [inspectionSaving, setInspectionSaving] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [inspectionForm, setInspectionForm] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspection_type: 'Rebar & Formwork Check',
    wbs_location: '',
    outcome: 'PASS',
    remarks: '',
  });
  const [inspectionChecklist, setInspectionChecklist] = useState<{ parameter: string; is_compliant: boolean; comments: string }[]>([]);
  const [selectedQualityInspection, setSelectedQualityInspection] = useState<QualityInspection | null>(null);

  // NCR modal state
  const [showNcrModal, setShowNcrModal] = useState(false);
  const [ncrSaving, setNcrSaving] = useState(false);
  const [ncrError, setNcrError] = useState<string | null>(null);
  const [ncrForm, setNcrForm] = useState({
    ncr_number: '',
    issued_to: '',
    root_cause: '',
    corrective_action_required: '',
    defect_description: '',
    defect_severity: 'MAJOR',
    estimated_rework_cost: '',
    estimated_delay_days: '',
  });

  // Safety Inspection (audit) modal state
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditSaving, setAuditSaving] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditForm, setAuditForm] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspection_type: 'WEEKLY_AUDIT',
    remarks: '',
  });
  const [auditChecklist, setAuditChecklist] = useState<{
    category: string;
    item_description: string;
    is_compliant: boolean;
    severity: string;
    corrective_action_required: boolean;
    comments: string;
  }[]>([]);
  const [selectedSafetyInspection, setSelectedSafetyInspection] = useState<SafetyInspection | null>(null);

  useEffect(() => {
    loadAllData();
  }, [siteId]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [qInsp, ncrData, sInsp, sObs, sInc, actData] = await Promise.all([
        fetchQualityInspections(siteId).catch(() => []),
        fetchNCRs(siteId).catch(() => []),
        fetchSafetyInspections(siteId).catch(() => []),
        fetchSafetyObservations(siteId).catch(() => []),
        fetchSafetyIncidents(siteId).catch(() => []),
        fetchCorrectiveActions(siteId).catch(() => []),
      ]);
      setQualityInspections(qInsp);
      setNcrs(ncrData);
      setSafetyInspections(sInsp);
      setSafetyObservations(sObs);
      setSafetyIncidents(sInc);
      setActions(actData);
    } catch (err) {
      console.error('Failed to load quality/safety data:', err);
    } finally {
      setLoading(false);
    }
  };

  const canActOn = (act: CorrectiveActionItem): boolean => {
    if (act.assignments?.some(a => a.assigned_user_id === currentUser.id)) return true;
    const allowedRoles = ACTION_RESPONSIBLE_ROLES[act.source_type] || DEFAULT_ACTION_ROLES;
    return currentUser.roles.some(r => allowedRoles.includes(r));
  };

  const handleUpdateActionStatus = async (actionId: string, newStatus: string) => {
    try {
      await updateActionStatusApi(actionId, newStatus, `Status updated to ${newStatus} by ${currentUser.email}`);
      await loadAllData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Status update failed');
    }
  };

  const openRaiseModal = () => {
    setRaiseForm({
      source_type: allowedSourceTypes[0] || 'MANUAL',
      title: '',
      description: '',
      priority: 'MEDIUM',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    setRaiseError(null);
    setShowRaiseModal(true);
  };

  const handleRaiseIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setRaising(true);
      setRaiseError(null);
      await createCorrectiveActionApi({
        site_id: effectiveSiteId,
        source_type: raiseForm.source_type,
        title: raiseForm.title,
        description: raiseForm.description,
        priority: raiseForm.priority,
        due_date: raiseForm.due_date,
      });
      setShowRaiseModal(false);
      setActiveSection('actions');
      await loadAllData();
    } catch (err: any) {
      setRaiseError(err?.response?.data?.detail || 'Failed to raise corrective action.');
    } finally {
      setRaising(false);
    }
  };

  const openInspectionModal = () => {
    setInspectionForm({
      inspection_date: new Date().toISOString().split('T')[0],
      inspection_type: 'Rebar & Formwork Check',
      wbs_location: '',
      outcome: 'PASS',
      remarks: '',
    });
    setInspectionChecklist([]);
    setInspectionError(null);
    setShowInspectionModal(true);
  };

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setInspectionSaving(true);
      setInspectionError(null);
      await createQualityInspectionApi({
        site_id: effectiveSiteId,
        ...inspectionForm,
        checklist_items: inspectionChecklist,
      });
      setShowInspectionModal(false);
      await loadAllData();
    } catch (err: any) {
      setInspectionError(err?.response?.data?.detail || 'Failed to log quality inspection.');
    } finally {
      setInspectionSaving(false);
    }
  };

  const openNcrModal = () => {
    setNcrForm({
      ncr_number: `NCR-${effectiveSiteId}-${Date.now().toString().slice(-6)}`,
      issued_to: '',
      root_cause: '',
      corrective_action_required: '',
      defect_description: '',
      defect_severity: 'MAJOR',
      estimated_rework_cost: '',
      estimated_delay_days: '',
    });
    setNcrError(null);
    setShowNcrModal(true);
  };

  const handleIssueNcr = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setNcrSaving(true);
      setNcrError(null);
      await issueNcrApi({
        site_id: effectiveSiteId,
        ncr_number: ncrForm.ncr_number,
        issued_to: ncrForm.issued_to,
        root_cause: ncrForm.root_cause,
        corrective_action_required: ncrForm.corrective_action_required,
        defect_description: ncrForm.defect_description || undefined,
        defect_severity: ncrForm.defect_severity,
        estimated_rework_cost: ncrForm.estimated_rework_cost ? parseFloat(ncrForm.estimated_rework_cost) : undefined,
        estimated_delay_days: ncrForm.estimated_delay_days ? parseInt(ncrForm.estimated_delay_days, 10) : undefined,
      });
      setShowNcrModal(false);
      await loadAllData();
    } catch (err: any) {
      setNcrError(err?.response?.data?.detail || 'Failed to issue NCR.');
    } finally {
      setNcrSaving(false);
    }
  };

  const handleCloseNcr = async (ncrId: string) => {
    try {
      await closeNcrApi(ncrId);
      await loadAllData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to close NCR.');
    }
  };

  const openAuditModal = () => {
    setAuditForm({
      inspection_date: new Date().toISOString().split('T')[0],
      inspection_type: 'WEEKLY_AUDIT',
      remarks: '',
    });
    setAuditChecklist([]);
    setAuditError(null);
    setShowAuditModal(true);
  };

  const handleCreateAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAuditSaving(true);
      setAuditError(null);
      await createSafetyInspectionApi({
        site_id: effectiveSiteId,
        ...auditForm,
        checklist_items: auditChecklist,
      });
      setShowAuditModal(false);
      await loadAllData();
    } catch (err: any) {
      setAuditError(err?.response?.data?.detail || 'Failed to log safety audit.');
    } finally {
      setAuditSaving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString()}`;
  };

  const filteredActions = statusFilter === 'ALL' 
    ? actions 
    : actions.filter(a => a.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Scope Correction Notice Banner */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-[#039583] text-white p-2 rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#023B77] uppercase tracking-wider">
              Quality Assurance & Field Safety Governance
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Verified field walkthroughs, certified quality inspections, and on-site corrective action tracking across active work packages.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono bg-teal-100 text-teal-800 px-2.5 py-1 rounded font-bold">
          Site: {siteId}
        </span>
      </div>

      {/* Apple-styled Segmented Switcher */}
      <div className="flex bg-slate-200/70 backdrop-blur-md rounded-2xl p-1 shadow-sm text-xs font-semibold gap-1 border border-slate-300/40">
        <button
          onClick={() => setActiveSection('quality')}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
            activeSection === 'quality' 
              ? 'bg-[#023B77] text-white shadow-sm font-bold' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>Quality & NCR ({ncrs.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('safety')}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
            activeSection === 'safety' 
              ? 'bg-[#023B77] text-white shadow-sm font-bold' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Safety Audits ({safetyObservations.length} Obs, {safetyIncidents.length} Incidents)</span>
        </button>

        <button
          onClick={() => setActiveSection('actions')}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
            activeSection === 'actions' 
              ? 'bg-[#023B77] text-white shadow-sm font-bold' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Corrective Actions ({actions.length})</span>
        </button>
      </div>

      {loading && (
        <div className="p-12 text-center text-slate-400 text-xs">
          Loading Quality & Safety domain records...
        </div>
      )}

      {/* ================= SECTION 1: QUALITY ================= */}
      {!loading && activeSection === 'quality' && (
        <div className="space-y-6">
          {canWriteQuality && (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={openInspectionModal}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg shadow-sm transition-colors"
              >
                <PlusCircle className="w-4 h-4" /> Log Inspection
              </button>
              <button
                onClick={openNcrModal}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm transition-colors"
              >
                <AlertTriangle className="w-4 h-4" /> Issue NCR
              </button>
            </div>
          )}

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Total Inspections</p>
              <p className="text-2xl font-bold text-[#023B77] mt-1">{qualityInspections.length}</p>
              <p className="text-xs text-slate-500 mt-1">Recorded quality walkthroughs</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Checklist Pass Rate</p>
              <p className="text-2xl font-bold text-[#039583] mt-1">
                {qualityInspections.length > 0
                  ? `${Math.round((qualityInspections.filter(i => i.outcome === 'PASS').length / qualityInspections.length) * 100)}%`
                  : '100%'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Compliance index</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Active NCRs</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {ncrs.filter(n => n.status !== 'CLOSED').length}
              </p>
              <p className="text-xs text-slate-500 mt-1">Awaiting rectification</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Cumulative Rework</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {formatCurrency(ncrs.reduce((acc, curr) => acc + (curr.rework_cost || 0), 0))}
              </p>
              <p className="text-xs text-slate-500 mt-1">Financial impact of defects</p>
            </div>
          </div>

          {/* NCR Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h4 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Non-Conformance Reports (NCR) Register
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase">
                    <th className="pb-2">NCR Number</th>
                    <th className="pb-2">Issued To</th>
                    <th className="pb-2">Root Cause</th>
                    <th className="pb-2 text-right">Rework Cost</th>
                    <th className="pb-2 text-right">Delay (Days)</th>
                    <th className="pb-2 text-right">Status</th>
                    {canWriteQuality && <th className="pb-2 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ncrs.map((n) => (
                    <tr key={n.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-mono font-bold text-[#023B77]">{n.ncr_number}</td>
                      <td className="py-3 font-semibold text-slate-800">{n.issued_to}</td>
                      <td className="py-3 text-slate-600 max-w-xs truncate">{n.root_cause || 'Under investigation'}</td>
                      <td className="py-3 text-right font-mono font-bold text-red-600">{formatCurrency(n.rework_cost)}</td>
                      <td className="py-3 text-right font-mono text-slate-700">{n.delay_days}d</td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          n.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {n.status}
                        </span>
                      </td>
                      {canWriteQuality && (
                        <td className="py-3 text-right">
                          {n.status !== 'CLOSED' && (
                            <button
                              onClick={() => handleCloseNcr(n.id)}
                              className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-semibold transition-all"
                            >
                              Close
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {ncrs.length === 0 && (
                    <tr>
                      <td colSpan={canWriteQuality ? 7 : 6} className="text-center py-6 text-slate-400 text-xs">No active NCRs for this site.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quality Inspections Log */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h4 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#023B77]" />
              Quality Inspections Log
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">WBS Location</th>
                    <th className="pb-2 text-right">Outcome</th>
                    <th className="pb-2 text-right">Checklist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qualityInspections.map((insp) => (
                    <tr key={insp.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-mono text-slate-700">{insp.inspection_date}</td>
                      <td className="py-3 font-semibold text-slate-800">{insp.inspection_type}</td>
                      <td className="py-3 text-slate-600">{insp.wbs_location}</td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          insp.outcome === 'PASS' ? 'bg-emerald-100 text-emerald-800' :
                          insp.outcome === 'CONDITIONAL_PASS' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {insp.outcome}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => setSelectedQualityInspection(insp)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#023B77] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                        >
                          <Eye className="w-3 h-3" /> {insp.checklist_items.length} Items
                        </button>
                      </td>
                    </tr>
                  ))}
                  {qualityInspections.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400 text-xs">No quality inspections logged for this site.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= SECTION 2: MANUAL SAFETY ================= */}
      {!loading && activeSection === 'safety' && (
        <div className="space-y-6">
          {canWriteSafety && (
            <div className="flex items-center justify-end">
              <button
                onClick={openAuditModal}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg shadow-sm transition-colors"
              >
                <PlusCircle className="w-4 h-4" /> Log Safety Audit
              </button>
            </div>
          )}

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Audits Conducted</p>
              <p className="text-2xl font-bold text-[#023B77] mt-1">{safetyInspections.length}</p>
              <p className="text-xs text-slate-500 mt-1">Walkthrough audits by SO</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Avg Compliance Score</p>
              <p className="text-2xl font-bold text-[#039583] mt-1">
                {safetyInspections.length > 0
                  ? `${Math.round(safetyInspections.reduce((acc, c) => acc + c.compliance_score_pct, 0) / safetyInspections.length)}%`
                  : '100%'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Human safety audit average</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Field Observations</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{safetyObservations.length}</p>
              <p className="text-xs text-slate-500 mt-1">Logged hazard observations</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Lost Time Incidents</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {safetyIncidents.filter(i => i.severity === 'LOST_TIME' || i.severity === 'FATALITY').length}
              </p>
              <p className="text-xs text-slate-500 mt-1">Serious safety occurrences</p>
            </div>
          </div>

          {/* Observations and Incidents Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Safety Observations */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Human Field Observations Log
              </h4>

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {safetyObservations.map((obs) => (
                  <div key={obs.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800">{obs.category}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        obs.severity === 'HIGH' || obs.severity === 'STOP_WORK' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {obs.severity}
                      </span>
                    </div>
                    <p className="text-slate-600">{obs.description}</p>
                    <div className="mt-2 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>Date: {obs.observation_date}</span>
                      <span className="font-sans font-semibold uppercase text-slate-500">{obs.status}</span>
                    </div>
                  </div>
                ))}

                {safetyObservations.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs">No safety observations logged for this site.</div>
                )}
              </div>
            </div>

            {/* Safety Incidents */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-500" />
                Reported Safety Incidents
              </h4>

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {safetyIncidents.map((inc) => (
                  <div key={inc.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800">{inc.title}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inc.severity === 'LOST_TIME' || inc.severity === 'FATALITY' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {inc.severity}
                      </span>
                    </div>
                    <p className="text-slate-600">{inc.description}</p>
                    <div className="mt-2 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Lost Time: <strong className="font-mono text-red-700">{inc.lost_time_hours} hrs</strong></span>
                      <span>Injured: <strong className="font-mono text-slate-700">{inc.injured_count}</strong></span>
                      <span className="font-mono">{inc.incident_date}</span>
                    </div>
                  </div>
                ))}

                {safetyIncidents.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs">Zero safety incidents recorded for this site.</div>
                )}
              </div>
            </div>
          </div>

          {/* Safety Audits (Inspections) Log */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h4 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#023B77]" />
              Safety Audits Log
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Audit Type</th>
                    <th className="pb-2 text-right">Compliance Score</th>
                    <th className="pb-2 text-right">Checklist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {safetyInspections.map((insp) => (
                    <tr key={insp.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-mono text-slate-700">{insp.inspection_date}</td>
                      <td className="py-3 font-semibold text-slate-800">{insp.inspection_type}</td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          insp.compliance_score_pct >= 90 ? 'bg-emerald-100 text-emerald-800' :
                          insp.compliance_score_pct >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {insp.compliance_score_pct}%
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => setSelectedSafetyInspection(insp)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#023B77] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                        >
                          <Eye className="w-3 h-3" /> {insp.checklist_items.length} Items
                        </button>
                      </td>
                    </tr>
                  ))}
                  {safetyInspections.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-slate-400 text-xs">No safety audits logged for this site.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= SECTION 3: CORRECTIVE ACTIONS ================= */}
      {!loading && activeSection === 'actions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#039583]" />
                Centralized Corrective Actions Register
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-source issue escalation (NCRs, Safety, Quality, and Field Audits)
              </p>
            </div>

            <div className="flex items-center gap-2">
              {canRaiseIssue && (
                <button
                  onClick={openRaiseModal}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg shadow-sm transition-colors"
                >
                  <PlusCircle className="w-4 h-4" /> Raise Issue
                </button>
              )}

              {/* Filter by Status */}
              <div className="flex items-center gap-1.5 text-xs">
                {['ALL', 'OPEN', 'IN_PROGRESS', 'CLOSED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      statusFilter === st
                        ? 'bg-[#023B77] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {filteredActions.map((act) => (
              <div key={act.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs hover:border-[#039583] transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        act.priority === 'CRITICAL' || act.priority === 'HIGH' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {act.priority}
                      </span>
                      <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                        Source: {act.source_type}
                      </span>
                      <span className="font-mono text-slate-400 text-[10px]">Site: {act.site_id}</span>
                    </div>
                    <h5 className="font-bold text-slate-900 text-sm mt-1.5">{act.title}</h5>
                    <p className="text-slate-600 mt-1">{act.description}</p>
                  </div>

                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                      act.status === 'CLOSED' 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : act.status === 'IN_PROGRESS' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-slate-200 text-slate-800'
                    }`}>
                      {act.status}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      Due: {act.due_date}
                    </p>
                  </div>
                </div>

                {/* Status action buttons */}
                <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    Status History: {act.status_history.length} events logged
                  </span>

                  <div className="flex items-center gap-2">
                    {!canActOn(act) && act.status !== 'CLOSED' && (
                      <span className="text-[10px] text-slate-400 italic">View only — not responsible for this action</span>
                    )}

                    {canActOn(act) && act.status !== 'IN_PROGRESS' && act.status !== 'CLOSED' && (
                      <button
                        onClick={() => handleUpdateActionStatus(act.id, 'IN_PROGRESS')}
                        className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold transition-all"
                      >
                        Start Progress
                      </button>
                    )}

                    {canActOn(act) && act.status !== 'CLOSED' && (
                      <button
                        onClick={() => handleUpdateActionStatus(act.id, 'CLOSED')}
                        className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-semibold transition-all flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verify & Close
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {filteredActions.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                No corrective actions match the current filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Raise Issue */}
      {showRaiseModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-lg w-full p-6 text-xs animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-slate-900">Raise Corrective Action</h3>
              <button
                type="button"
                onClick={() => setShowRaiseModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                aria-label="Close raise issue modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-500 mb-4">
              Escalate a finding for site {effectiveSiteId}. Only the source types you are responsible for are shown.
            </p>

            {raiseError && (
              <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {raiseError}
              </div>
            )}

            <form onSubmit={handleRaiseIssue} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Source Type</label>
                <select
                  required
                  value={raiseForm.source_type}
                  onChange={(e) => setRaiseForm(prev => ({ ...prev, source_type: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                >
                  {allowedSourceTypes.map(st => (
                    <option key={st} value={st}>{SOURCE_TYPE_LABELS[st] || st}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={raiseForm.title}
                  onChange={(e) => setRaiseForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Short summary of the issue..."
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  value={raiseForm.description}
                  onChange={(e) => setRaiseForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What happened, where, and what needs to be fixed..."
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={raiseForm.priority}
                    onChange={(e) => setRaiseForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                  >
                    {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={raiseForm.due_date}
                    onChange={(e) => setRaiseForm(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRaiseModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={raising}
                  className="px-4 py-1.5 bg-[#023B77] text-white rounded-lg font-bold hover:bg-[#012d5a] disabled:opacity-50"
                >
                  {raising ? 'Raising...' : 'Raise Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Quality Inspection */}
      {showInspectionModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-900">Log Quality Inspection</h3>
              <button type="button" onClick={() => setShowInspectionModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateInspection} className="p-5 overflow-y-auto space-y-3 text-xs">
              {inspectionError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {inspectionError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inspection Date</label>
                  <input
                    type="date" required
                    value={inspectionForm.inspection_date}
                    onChange={(e) => setInspectionForm(prev => ({ ...prev, inspection_date: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Outcome</label>
                  <select
                    value={inspectionForm.outcome}
                    onChange={(e) => setInspectionForm(prev => ({ ...prev, outcome: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                  >
                    {['PASS', 'CONDITIONAL_PASS', 'FAIL'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Inspection Type</label>
                <input
                  type="text" required
                  value={inspectionForm.inspection_type}
                  onChange={(e) => setInspectionForm(prev => ({ ...prev, inspection_type: e.target.value }))}
                  placeholder="e.g. Rebar & Formwork Check"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">WBS Location</label>
                <input
                  type="text" required
                  value={inspectionForm.wbs_location}
                  onChange={(e) => setInspectionForm(prev => ({ ...prev, wbs_location: e.target.value }))}
                  placeholder="e.g. 5th Floor Slab Zone 1"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks</label>
                <textarea
                  rows={2}
                  value={inspectionForm.remarks}
                  onChange={(e) => setInspectionForm(prev => ({ ...prev, remarks: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none leading-relaxed"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Checklist Items</label>
                  <button
                    type="button"
                    onClick={() => setInspectionChecklist(prev => [...prev, { parameter: '', is_compliant: true, comments: '' }])}
                    className="text-[11px] font-semibold text-[#023B77] hover:underline"
                  >
                    + Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {inspectionChecklist.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <input
                        type="text"
                        placeholder="Parameter checked"
                        value={item.parameter}
                        onChange={(e) => setInspectionChecklist(prev => prev.map((it, i) => i === idx ? { ...it, parameter: e.target.value } : it))}
                        className="flex-1 p-1.5 border border-slate-200 rounded outline-none"
                      />
                      <label className="flex items-center gap-1 font-semibold text-slate-600 shrink-0">
                        <input
                          type="checkbox"
                          checked={item.is_compliant}
                          onChange={(e) => setInspectionChecklist(prev => prev.map((it, i) => i === idx ? { ...it, is_compliant: e.target.checked } : it))}
                        /> Compliant
                      </label>
                      <button type="button" onClick={() => setInspectionChecklist(prev => prev.filter((_, i) => i !== idx))} className="text-rose-500 hover:text-rose-700 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {inspectionChecklist.length === 0 && (
                    <p className="text-slate-400 italic">No checklist items added yet (optional).</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowInspectionModal(false)} className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200">
                  Cancel
                </button>
                <button type="submit" disabled={inspectionSaving} className="px-4 py-1.5 bg-[#023B77] text-white rounded-lg font-bold hover:bg-[#012d5a] disabled:opacity-50">
                  {inspectionSaving ? 'Saving...' : 'Log Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Issue NCR */}
      {showNcrModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-900">Issue Non-Conformance Report</h3>
              <button type="button" onClick={() => setShowNcrModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleIssueNcr} className="p-5 overflow-y-auto space-y-3 text-xs">
              {ncrError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {ncrError}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">NCR Number</label>
                <input
                  type="text" required
                  value={ncrForm.ncr_number}
                  onChange={(e) => setNcrForm(prev => ({ ...prev, ncr_number: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Issued To (Contractor / Vendor)</label>
                <input
                  type="text" required
                  value={ncrForm.issued_to}
                  onChange={(e) => setNcrForm(prev => ({ ...prev, issued_to: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Root Cause</label>
                <textarea
                  required rows={2}
                  value={ncrForm.root_cause}
                  onChange={(e) => setNcrForm(prev => ({ ...prev, root_cause: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Corrective Action Required</label>
                <textarea
                  required rows={2}
                  value={ncrForm.corrective_action_required}
                  onChange={(e) => setNcrForm(prev => ({ ...prev, corrective_action_required: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Defect Description (optional)</label>
                <textarea
                  rows={2}
                  value={ncrForm.defect_description}
                  onChange={(e) => setNcrForm(prev => ({ ...prev, defect_description: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Severity</label>
                  <select
                    value={ncrForm.defect_severity}
                    onChange={(e) => setNcrForm(prev => ({ ...prev, defect_severity: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                  >
                    {['MINOR', 'MAJOR', 'CRITICAL'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rework Cost (₹)</label>
                  <input
                    type="number" min={0} step={1000}
                    value={ncrForm.estimated_rework_cost}
                    onChange={(e) => setNcrForm(prev => ({ ...prev, estimated_rework_cost: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Delay (Days)</label>
                  <input
                    type="number" min={0}
                    value={ncrForm.estimated_delay_days}
                    onChange={(e) => setNcrForm(prev => ({ ...prev, estimated_delay_days: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowNcrModal(false)} className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200">
                  Cancel
                </button>
                <button type="submit" disabled={ncrSaving} className="px-4 py-1.5 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 disabled:opacity-50">
                  {ncrSaving ? 'Issuing...' : 'Issue NCR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Safety Audit */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-900">Log Safety Audit</h3>
              <button type="button" onClick={() => setShowAuditModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAudit} className="p-5 overflow-y-auto space-y-3 text-xs">
              {auditError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {auditError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inspection Date</label>
                  <input
                    type="date" required
                    value={auditForm.inspection_date}
                    onChange={(e) => setAuditForm(prev => ({ ...prev, inspection_date: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Audit Type</label>
                  <select
                    value={auditForm.inspection_type}
                    onChange={(e) => setAuditForm(prev => ({ ...prev, inspection_type: e.target.value }))}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                  >
                    {['WEEKLY_AUDIT', 'ROUTINE_WALKTHROUGH', 'SCAFFOLD_INSPECTION', 'ELECTRICAL_CHECK'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks</label>
                <textarea
                  rows={2}
                  value={auditForm.remarks}
                  onChange={(e) => setAuditForm(prev => ({ ...prev, remarks: e.target.value }))}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none leading-relaxed"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Checklist Items</label>
                  <button
                    type="button"
                    onClick={() => setAuditChecklist(prev => [...prev, {
                      category: 'PPE_COMPLIANCE', item_description: '', is_compliant: true, severity: 'LOW', corrective_action_required: false, comments: ''
                    }])}
                    className="text-[11px] font-semibold text-[#023B77] hover:underline"
                  >
                    + Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {auditChecklist.map((item, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={item.category}
                          onChange={(e) => setAuditChecklist(prev => prev.map((it, i) => i === idx ? { ...it, category: e.target.value } : it))}
                          className="p-1.5 border border-slate-200 rounded outline-none bg-white shrink-0"
                        >
                          {['PPE_COMPLIANCE', 'SCAFFOLDING', 'ELECTRICAL', 'HOUSEKEEPING', 'FIRE_SAFETY', 'EXCAVATION'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Item description"
                          value={item.item_description}
                          onChange={(e) => setAuditChecklist(prev => prev.map((it, i) => i === idx ? { ...it, item_description: e.target.value } : it))}
                          className="flex-1 p-1.5 border border-slate-200 rounded outline-none"
                        />
                        <button type="button" onClick={() => setAuditChecklist(prev => prev.filter((_, i) => i !== idx))} className="text-rose-500 hover:text-rose-700 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={item.is_compliant}
                            onChange={(e) => setAuditChecklist(prev => prev.map((it, i) => i === idx ? { ...it, is_compliant: e.target.checked } : it))}
                          /> Compliant
                        </label>
                        <select
                          value={item.severity}
                          onChange={(e) => setAuditChecklist(prev => prev.map((it, i) => i === idx ? { ...it, severity: e.target.value } : it))}
                          className="p-1.5 border border-slate-200 rounded outline-none bg-white"
                        >
                          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <label className="flex items-center gap-1 font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={item.corrective_action_required}
                            onChange={(e) => setAuditChecklist(prev => prev.map((it, i) => i === idx ? { ...it, corrective_action_required: e.target.checked } : it))}
                          /> Needs Action
                        </label>
                      </div>
                    </div>
                  ))}
                  {auditChecklist.length === 0 && (
                    <p className="text-slate-400 italic">No checklist items added yet (optional).</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAuditModal(false)} className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200">
                  Cancel
                </button>
                <button type="submit" disabled={auditSaving} className="px-4 py-1.5 bg-[#023B77] text-white rounded-lg font-bold hover:bg-[#012d5a] disabled:opacity-50">
                  {auditSaving ? 'Saving...' : 'Log Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Quality Inspection Checklist */}
      {selectedQualityInspection && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedQualityInspection.inspection_type}</h3>
                <p className="text-xs text-slate-500">{selectedQualityInspection.wbs_location} • {selectedQualityInspection.inspection_date}</p>
              </div>
              <button type="button" onClick={() => setSelectedQualityInspection(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2 text-xs">
              {selectedQualityInspection.remarks && (
                <p className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-slate-700">{selectedQualityInspection.remarks}</p>
              )}
              {selectedQualityInspection.checklist_items.map((item, idx) => (
                <div key={item.id || idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{item.parameter}</p>
                    {item.comments && <p className="text-slate-500 mt-0.5">{item.comments}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${item.is_compliant ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {item.is_compliant ? 'Compliant' : 'Non-Compliant'}
                  </span>
                </div>
              ))}
              {selectedQualityInspection.checklist_items.length === 0 && (
                <p className="text-slate-400 italic text-center py-6">No checklist items recorded for this inspection.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Safety Audit Checklist */}
      {selectedSafetyInspection && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedSafetyInspection.inspection_type}</h3>
                <p className="text-xs text-slate-500">{selectedSafetyInspection.inspection_date} • {selectedSafetyInspection.compliance_score_pct}% compliant</p>
              </div>
              <button type="button" onClick={() => setSelectedSafetyInspection(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2 text-xs">
              {selectedSafetyInspection.remarks && (
                <p className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-slate-700">{selectedSafetyInspection.remarks}</p>
              )}
              {selectedSafetyInspection.checklist_items.map((item, idx) => (
                <div key={item.id || idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded mr-1.5">{item.category}</span>
                      <span className="font-semibold text-slate-800">{item.item_description}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${item.is_compliant ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {item.is_compliant ? 'Compliant' : item.severity}
                    </span>
                  </div>
                </div>
              ))}
              {selectedSafetyInspection.checklist_items.length === 0 && (
                <p className="text-slate-400 italic text-center py-6">No checklist items recorded for this audit.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
