import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  RefreshCw, 
  Sliders, 
  AlertTriangle, 
  Clock, 
  X,
  Info
} from 'lucide-react';
import { 
  fetchLeaderboard, 
  calculateLeaderboard, 
  fetchActiveMethodology, 
  type RankingSnapshot, 
  type RankingMethodology, 
  type UserProfile,
  type RankingScore
} from '../../services/api';

interface SiteLeaderboardViewProps {
  currentUser: UserProfile | null;
  onSelectSite?: (siteId: string) => void;
}

const KRA_NAMES: Record<number, { code: string; label: string; weight: string }> = {
  1: { code: 'PROG', label: 'Progress', weight: '20%' },
  2: { code: 'MANP', label: 'Manpower', weight: '15%' },
  3: { code: 'COST', label: 'Cost Control', weight: '20%' },
  4: { code: 'SCHD', label: 'Schedule', weight: '15%' },
  5: { code: 'QUAL', label: 'Quality', weight: '10%' },
  6: { code: 'SAFE', label: 'Safety Compliance', weight: '10%' },
  7: { code: 'CLOS', label: 'Issue Closure', weight: '10%' },
};

export const SiteLeaderboardView: React.FC<SiteLeaderboardViewProps> = ({ currentUser, onSelectSite }) => {
  const [periodId, setPeriodId] = useState<string>('2026-W44');
  const [snapshots, setSnapshots] = useState<RankingSnapshot[]>([]);
  const [methodology, setMethodology] = useState<RankingMethodology | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [calculating, setCalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showMethodologyModal, setShowMethodologyModal] = useState<boolean>(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<RankingSnapshot | null>(null);

  const canRecalculate = currentUser?.roles.some(r => ['ORG_ADMIN', 'PROJECT_CONTROLLER'].includes(r));

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [lbData, methData] = await Promise.all([
        fetchLeaderboard(periodId),
        fetchActiveMethodology().catch(() => null)
      ]);
      setSnapshots(lbData);
      setMethodology(methData);
    } catch (err: any) {
      console.error('Error loading leaderboard:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load leaderboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [periodId]);

  const handleRecalculate = async () => {
    try {
      setCalculating(true);
      setError(null);
      const updatedSnapshots = await calculateLeaderboard(periodId);
      setSnapshots(updatedSnapshots);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Recalculation failed.');
    } finally {
      setCalculating(false);
    }
  };

  const getScoreBadgeColor = (score: number | null | undefined, status: string) => {
    if (status === 'INSUFFICIENT_DATA' || score === null || score === undefined) {
      return 'bg-slate-100 text-slate-500 border-slate-300';
    }
    if (score >= 85) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (score >= 70) return 'bg-teal-100 text-teal-800 border-teal-300';
    if (score >= 50) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-rose-100 text-rose-800 border-rose-300';
  };

  const topSite = snapshots.find(s => s.ranking_position === 1);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-50 text-[#023B77] rounded-lg border border-blue-200">
                <Trophy className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">Authoritative 8-KRA Site Leaderboard</h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                Provisional Weights v1.0
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              One authoritative ranking engine. Traceable calculations, transparent weightings, and no silent zero-filling.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <Clock className="w-4 h-4 text-slate-400" />
              <label htmlFor="period-select" className="text-xs font-semibold text-slate-600">Period:</label>
              <select
                id="period-select"
                aria-label="Ranking Period"
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className="text-xs font-bold text-[#023B77] bg-transparent outline-none cursor-pointer"
              >
                <option value="2026-W44">2026-W44 (Current Week)</option>
                <option value="2026-W43">2026-W43 (Prior Week)</option>
                <option value="2026-W42">2026-W42</option>
              </select>
            </div>

            <button
              onClick={() => setShowMethodologyModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
            >
              <Sliders className="w-3.5 h-3.5" />
              Weights & Rules
            </button>

            {canRecalculate && (
              <button
                onClick={handleRecalculate}
                disabled={calculating}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${calculating ? 'animate-spin' : ''}`} />
                {calculating ? 'Calculating...' : 'Recalculate'}
              </button>
            )}
          </div>
        </div>

        {/* Executive Methodology Baseline */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200/80 text-slate-700 rounded-xl text-xs flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#039583]" />
            <span className="font-semibold text-slate-800">8-KRA Operational Baseline:</span>
            <span className="text-slate-600">
              Progress 20% • Cost 20% • Manpower 15% • Schedule 15% • Quality 10% • Safety 10% • Closure 10% (70% DCI Minimum Threshold)
            </span>
          </div>
          <button
            onClick={() => setShowMethodologyModal(true)}
            className="text-[11px] font-semibold text-[#023B77] hover:underline shrink-0 ml-2"
          >
            Inspect Weights &rarr;
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Spotlight Card */}
        <div className="bg-gradient-to-br from-[#023B77] to-[#01254d] text-white p-5 rounded-xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-blue-200">Current Leader (#1)</span>
            <span className="p-1.5 bg-amber-400 text-amber-950 rounded-full">
              <Trophy className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xl font-black mt-2">{topSite?.site_name || 'Calculating...'}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-300">
              {topSite?.composite_score !== null && topSite?.composite_score !== undefined ? topSite.composite_score : 'N/A'}
            </span>
            <span className="text-xs text-blue-200">/ 100 Index</span>
          </div>
          <p className="text-[11px] text-blue-200 mt-1">
            Data Completeness: {topSite?.data_completeness_pct || 0}% • Status: {topSite?.status}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Portfolio Monitored</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{snapshots.length} Sites</p>
          <p className="text-xs text-slate-500 mt-1">
            {snapshots.filter(s => s.status === 'OFFICIAL').length} Official • {snapshots.filter(s => s.status === 'PROVISIONAL').length} Provisional
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Methodology Framework</p>
          <p className="text-3xl font-bold text-[#039583] mt-2">8 KRAs</p>
          <p className="text-xs text-slate-500 mt-1">
            Progress 20%, Cost 20%, Manpower 15%, Sched 15%
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-400">Safety Compliance Model</p>
          <p className="text-3xl font-bold text-blue-700 mt-2">100% Verified</p>
          <p className="text-xs text-slate-500 mt-1">
            Audited field inspections & lost-time tracking
          </p>
        </div>
      </div>

      {/* Main Leaderboard Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Site Performance Ranking Table</h3>
            <p className="text-xs text-slate-500">Official composite scores based on approved weights and verified field data.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Official (100% DCI)
            </span>
            <span className="flex items-center gap-1 text-amber-700 font-medium ml-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Provisional (&ge;70% DCI)
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#023B77]" />
            Loading authoritative leaderboard...
          </div>
        ) : snapshots.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No ranking snapshots found for period {periodId}. Click "Recalculate" to generate.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-16 text-center">Rank</th>
                  <th className="py-3 px-4">Site Identifier & Name</th>
                  <th className="py-3 px-4 text-center">Composite Score</th>
                  <th className="py-3 px-4 text-center">DCI %</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-2 text-center" title="KRA 1: Construction Progress (20%)">Prog (20%)</th>
                  <th className="py-3 px-2 text-center" title="KRA 2: Manpower & Productivity (15%)">Manp (15%)</th>
                  <th className="py-3 px-2 text-center" title="KRA 3: Cost & Expenditure (20%)">Cost (20%)</th>
                  <th className="py-3 px-2 text-center" title="KRA 4: Schedule Adherence (15%)">Schd (15%)</th>
                  <th className="py-3 px-2 text-center" title="KRA 5: Quality & Defect Prevention (10%)">Qual (10%)</th>
                  <th className="py-3 px-2 text-center" title="KRA 6: Safety Compliance (10%)">Safe (10%)</th>
                  <th className="py-3 px-2 text-center" title="KRA 7: Task & Issue Closure (10%)">Clos (10%)</th>
                  <th className="py-3 px-4 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {snapshots.map((snap) => {
                  const scoreMap: Record<number, RankingScore> = {};
                  snap.scores.forEach(s => { scoreMap[s.kra_id] = s; });

                  return (
                    <tr key={snap.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Rank Position */}
                      <td className="py-3.5 px-4 text-center">
                        {snap.ranking_position === 1 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 font-black border border-amber-300">
                            🥇 1
                          </span>
                        ) : snap.ranking_position === 2 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-800 font-black border border-slate-300">
                            🥈 2
                          </span>
                        ) : snap.ranking_position === 3 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-50 text-amber-900 font-bold border border-amber-200">
                            🥉 3
                          </span>
                        ) : snap.ranking_position ? (
                          <span className="text-slate-600 font-bold">#{snap.ranking_position}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Site Info */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => onSelectSite?.(snap.site_id)}
                          className="font-bold text-slate-900 hover:text-[#023B77] hover:underline text-left"
                        >
                          {snap.site_name || snap.site_id}
                        </button>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>{snap.site_id}</span>
                          {snap.is_stale && (
                            <span className="text-amber-600 font-sans font-bold flex items-center gap-0.5">
                              • <Clock className="w-3 h-3" /> &gt;48h stale
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Composite Score */}
                      <td className="py-3.5 px-4 text-center">
                        {snap.composite_score !== null && snap.composite_score !== undefined ? (
                          <span className={`inline-block px-3 py-1 rounded-full font-black text-sm border ${getScoreBadgeColor(snap.composite_score, snap.status)}`}>
                            {snap.composite_score}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px]">
                            Unranked
                          </span>
                        )}
                      </td>

                      {/* DCI % */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="w-16 mx-auto">
                          <span className="font-bold text-slate-700">{snap.data_completeness_pct}%</span>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${snap.data_completeness_pct >= 100 ? 'bg-emerald-500' : snap.data_completeness_pct >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${snap.data_completeness_pct}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          snap.status === 'OFFICIAL' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          snap.status === 'PROVISIONAL' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-slate-100 text-slate-600 border border-slate-300'
                        }`}>
                          {snap.status}
                        </span>
                      </td>

                      {/* KRA 1 to 7 scores */}
                      {[1, 2, 3, 4, 5, 6, 7].map((kid) => {
                        const sc = scoreMap[kid];
                        return (
                          <td key={kid} className="py-3.5 px-2 text-center font-mono">
                            {sc && !sc.is_missing && sc.raw_score !== null && sc.raw_score !== undefined ? (
                              <span className={`text-[11px] font-bold ${
                                sc.raw_score >= 80 ? 'text-emerald-700' :
                                sc.raw_score >= 60 ? 'text-slate-800' : 'text-rose-600'
                              }`}>
                                {sc.raw_score}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-[10px]">null</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Audit Details Button */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedSnapshot(snap)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#023B77] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                        >
                          Audit Breakdown
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Breakdown Modal */}
      {selectedSnapshot && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-blue-100 text-[#023B77]">
                  {selectedSnapshot.site_id}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  8-KRA Audit Breakdown — {selectedSnapshot.site_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Calculated at {new Date(selectedSnapshot.calculated_at).toLocaleString()} • Period: {selectedSnapshot.period_id}
                </p>
              </div>
              <button 
                onClick={() => setSelectedSnapshot(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <p className="text-slate-400 uppercase font-semibold text-[10px]">Composite Score</p>
                  <p className="text-xl font-black text-[#023B77] mt-0.5">
                    {selectedSnapshot.composite_score !== null && selectedSnapshot.composite_score !== undefined ? selectedSnapshot.composite_score : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase font-semibold text-[10px]">Data Completeness</p>
                  <p className="text-xl font-black text-emerald-700 mt-0.5">{selectedSnapshot.data_completeness_pct}%</p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase font-semibold text-[10px]">Ranking Status</p>
                  <p className="text-base font-bold text-slate-800 mt-1">{selectedSnapshot.status}</p>
                </div>
              </div>

              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Constituent KRA Calculation Ledger
              </h4>

              <div className="space-y-3">
                {selectedSnapshot.scores.map((score) => {
                  const meta = KRA_NAMES[score.kra_id] || { code: 'KRA', label: `KRA ${score.kra_id}`, weight: 'N/A' };
                  return (
                    <div key={score.kra_id} className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                            KRA {score.kra_id}
                          </span>
                          <span className="font-bold text-slate-900">{meta.label}</span>
                          <span className="text-slate-400">({meta.weight} weight)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {score.is_missing ? (
                            <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold text-[10px]">
                              Data Missing
                            </span>
                          ) : (
                            <>
                              <span className="text-slate-500">Raw: <strong className="text-slate-900 font-mono">{score.raw_score}</strong></span>
                              <span className="text-[#023B77] font-semibold">Contribution: <strong className="font-mono">{score.weighted_score} pts</strong></span>
                            </>
                          )}
                        </div>
                      </div>

                      {score.details_json && (
                        <div className="bg-slate-50 p-2.5 rounded font-mono text-[11px] text-slate-600 border border-slate-100">
                          {Object.entries(score.details_json).map(([key, val]) => (
                            <div key={key} className="flex justify-between py-0.5">
                              <span className="text-slate-500">{key}:</span>
                              <span className="text-slate-900 font-semibold">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Methodology Inspector Modal */}
      {showMethodologyModal && methodology && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {methodology.version_code} Active
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{methodology.name}</h3>
                <p className="text-xs text-slate-500">Approved corporate standard weights</p>
              </div>
              <button 
                onClick={() => setShowMethodologyModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-slate-700 leading-relaxed">
                <p className="font-bold text-[#023B77] mb-1 flex items-center gap-1.5">
                  <Info className="w-4 h-4" /> Methodology Governance Principles
                </p>
                <p>{methodology.rationale || 'Official organizational standard for ranking multi-site construction execution.'}</p>
                <p className="mt-2 text-[11px] text-slate-600 font-semibold">
                  • Missing field data is never treated as zero: sites with &lt;70% completeness remain Unranked.<br />
                  • Safety compliance (KRA 6) is strictly calculated from certified site inspections, observation audits, and incident records.
                </p>
              </div>

              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Weight Allocation by KRA
              </h4>

              <div className="space-y-2">
                {methodology.weights.map((w) => (
                  <div key={w.kra_id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <span className="font-mono font-bold text-slate-500 mr-2 text-[10px]">KRA {w.kra_id}</span>
                      <span className="font-bold text-slate-800">{KRA_NAMES[w.kra_id]?.label || `KRA ${w.kra_id}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-[#039583] h-full rounded-full" style={{ width: `${w.weight_pct * 3.5}%` }}></div>
                      </div>
                      <span className="font-black text-[#023B77] font-mono text-sm w-12 text-right">{w.weight_pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowMethodologyModal(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
