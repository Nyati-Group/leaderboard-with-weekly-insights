import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  FileCheck2, 
  AlertOctagon, 
  Activity,
  AlertCircle
} from 'lucide-react';
import { 
  fetchQualityInspections, 
  fetchNCRs, 
  fetchSafetyInspections, 
  fetchSafetyObservations, 
  fetchSafetyIncidents, 
  fetchCorrectiveActions,
  updateActionStatusApi,
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

  const handleUpdateActionStatus = async (actionId: string, newStatus: string) => {
    try {
      await updateActionStatusApi(actionId, newStatus, `Status updated to ${newStatus} by ${currentUser.email}`);
      await loadAllData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Status update failed');
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
              Human-Audited Quality & Safety Governance
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Strictly grounded in field walkthroughs, manual observations, and certified NCRs. CCTV/Vision is managed separately in SiteVision.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono bg-teal-100 text-teal-800 px-2.5 py-1 rounded font-bold">
          Site: {siteId}
        </span>
      </div>

      {/* Primary Section Switcher */}
      <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm text-xs font-bold">
        <button
          onClick={() => setActiveSection('quality')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSection === 'quality' 
              ? 'bg-[#023B77] text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>Quality & NCR Register ({ncrs.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('safety')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSection === 'safety' 
              ? 'bg-[#023B77] text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Manual Safety Management ({safetyObservations.length} Obs, {safetyIncidents.length} Inc)</span>
        </button>

        <button
          onClick={() => setActiveSection('actions')}
          className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSection === 'actions' 
              ? 'bg-[#023B77] text-white shadow-sm' 
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Corrective Actions Center ({actions.length})</span>
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
                    </tr>
                  ))}
                  {ncrs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-400 text-xs">No active NCRs for this site.</td>
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
                    {act.status !== 'IN_PROGRESS' && act.status !== 'CLOSED' && (
                      <button
                        onClick={() => handleUpdateActionStatus(act.id, 'IN_PROGRESS')}
                        className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-semibold transition-all"
                      >
                        Start Progress
                      </button>
                    )}

                    {act.status !== 'CLOSED' && (
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
    </div>
  );
};
