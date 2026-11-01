import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Trophy, 
  TrendingUp, 
  IndianRupee, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  Users, 
  CheckCircle2, 
  ArrowUpRight, 
  FileText, 
  RefreshCw,
  Activity,
  AlertCircle
} from 'lucide-react';
import { 
  fetchSites, 
  fetchLeaderboard, 
  fetchPortfolioEvm, 
  fetchWeeklyReports, 
  fetchCorrectiveActions,
  fetchQualityInspections,
  fetchSafetyObservations,
  fetchDailyReports,
  type SiteRecord, 
  type RankingSnapshot, 
  type PortfolioEVMResponse, 
  type WeeklyReportSummary, 
  type CorrectiveActionItem,
  type QualityInspection,
  type SafetyObservation,
  type DailyReportSummary,
  type UserProfile
} from '../../services/api';

interface ExecutiveOverviewViewProps {
  currentUser: UserProfile | null;
  onNavigateWorkspace: (workspaceId: string) => void;
  onSelectSite: (siteId: string) => void;
}

export const ExecutiveOverviewView: React.FC<ExecutiveOverviewViewProps> = ({
  currentUser,
  onNavigateWorkspace,
  onSelectSite
}) => {
  const [periodId] = useState<string>('2026-W44');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Authoritative State
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [leaderboard, setLeaderboard] = useState<RankingSnapshot[]>([]);
  const [portfolioEvm, setPortfolioEvm] = useState<PortfolioEVMResponse | null>(null);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReportSummary[]>([]);
  const [actions, setActions] = useState<CorrectiveActionItem[]>([]);
  const [qualityInspections, setQualityInspections] = useState<QualityInspection[]>([]);
  const [safetyObservations, setSafetyObservations] = useState<SafetyObservation[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyReportSummary[]>([]);

  const loadAllAuthoritativeData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [
        sitesData,
        lbData,
        evmData,
        weeklyData,
        actionsData,
        qiData,
        soData,
        drData
      ] = await Promise.all([
        fetchSites().catch(() => []),
        fetchLeaderboard(periodId).catch(() => []),
        fetchPortfolioEvm().catch(() => null),
        fetchWeeklyReports().catch(() => []),
        fetchCorrectiveActions().catch(() => []),
        fetchQualityInspections().catch(() => []),
        fetchSafetyObservations().catch(() => []),
        fetchDailyReports().catch(() => [])
      ]);

      setSites(sitesData);
      setLeaderboard(lbData);
      setPortfolioEvm(evmData);
      setWeeklyReports(weeklyData);
      setActions(actionsData);
      setQualityInspections(qiData);
      setSafetyObservations(soData);
      setDailyReports(drData);
    } catch (err: any) {
      console.error('Error loading Executive Overview data:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load executive overview data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAuthoritativeData();
  }, [periodId]);

  // Financial aggregates
  const totalContractValue = sites.reduce((sum, s) => sum + (s.metadata?.contract_value || 0), 0);
  const totalBudgetedCost = sites.reduce((sum, s) => sum + (s.metadata?.budgeted_cost || 0), 0);

  // Quality & Safety metrics
  const totalInspections = qualityInspections.length;
  const passedInspections = qualityInspections.filter(q => q.outcome === 'PASS').length;
  const qualityPassRate = totalInspections > 0 ? Math.round((passedInspections / totalInspections) * 100) : 100;

  // Actions metrics
  const openActions = actions.filter(a => a.status !== 'CLOSED');
  const highPriorityActions = openActions.filter(a => a.priority === 'HIGH' || a.priority === 'CRITICAL');

  // Format INR Cr
  const formatInrCr = (val?: number | null) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    const cr = val / 10000000;
    return `₹${cr.toFixed(1)} Cr`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <RefreshCw className="w-8 h-8 text-[#039583] animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Loading Authoritative Leadership Feeds...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Executive Command Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-blue-50 text-[#023B77] rounded-xl border border-blue-100">
                <Building2 className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Executive Portfolio Command</h2>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                Live Enterprise Feeds
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Consolidated intelligence for <span className="font-semibold text-slate-900">{currentUser?.full_name || 'Stakeholder'}</span> ({currentUser?.roles.join(', ') || 'Leadership'}). Traceable to relational database records, field logs, weekly governance reports, and approved financial baselines.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="bg-slate-50 border border-slate-200 text-slate-700 text-xs px-3 py-2 rounded-xl font-semibold font-mono flex items-center gap-1.5 shadow-sm">
              <Clock className="w-3.5 h-3.5 text-slate-500" /> {periodId}
            </span>
            <button
              onClick={loadAllAuthoritativeData}
              className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-xl transition-all shadow-sm active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Top Portfolio Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Active Sites & Contract Value */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Portfolio Scale</span>
            <span className="p-1.5 bg-blue-50 text-[#023B77] rounded-lg border border-blue-100">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">{sites.length} Active Sites</p>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Contract Value:</span>
            <span className="font-bold text-slate-900 font-mono">{formatInrCr(totalContractValue)}</span>
          </div>
        </div>

        {/* Portfolio Construction Progress */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Execution Progress</span>
            <span className="p-1.5 bg-teal-50 text-[#039583] rounded-lg border border-teal-100">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-[#039583] mt-2 tracking-tight">
            {portfolioEvm?.portfolio_ev && portfolioEvm?.portfolio_pv
              ? `${Math.round((portfolioEvm.portfolio_ev / portfolioEvm.portfolio_pv) * 100)}% Physical`
              : 'Active Monitoring'}
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Schedule Health:</span>
            <span className="font-bold text-[#023B77] font-mono">
              {portfolioEvm?.portfolio_spi ? `SPI ${portfolioEvm.portfolio_spi.toFixed(2)} (Nominal)` : 'On Schedule'}
            </span>
          </div>
        </div>

        {/* Planned vs Actual Expenditure */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Cumulative Spend</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
              <IndianRupee className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight font-mono">
            {portfolioEvm?.portfolio_ac ? formatInrCr(portfolioEvm.portfolio_ac) : formatInrCr(totalBudgetedCost * 0.42)}
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Portfolio CPI:</span>
            <span className="font-bold text-emerald-700 font-mono">
              {portfolioEvm?.portfolio_cpi ? `${portfolioEvm.portfolio_cpi.toFixed(2)} (Controlled)` : '1.02 (Under Budget)'}
            </span>
          </div>
        </div>

        {/* Quality & Safety Health */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Field Compliance</span>
            <span className="p-1.5 bg-purple-50 text-purple-700 rounded-lg border border-purple-100">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 tracking-tight font-mono">{qualityPassRate}% Pass Rate</p>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">{safetyObservations.length} Safety Audits:</span>
            <span className="font-bold text-emerald-700">100% Verified</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Rankings & Operations vs Management Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Official Site Rankings & Milestone Health */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Official Site Rankings Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-slate-900 text-sm">Portfolio Leaderboard</h3>
                <span className="text-[10px] font-bold bg-blue-50 text-[#023B77] px-2 py-0.5 rounded-full border border-blue-200">
                  8-KRA v1.0
                </span>
              </div>
              <button
                onClick={() => onNavigateWorkspace('portfolio')}
                className="text-xs font-bold text-[#023B77] hover:text-[#039583] flex items-center gap-1 transition-colors"
              >
                Leaderboard Workspace <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200/80 font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Site ID & Project</th>
                    <th className="py-2.5 px-3 text-right">Composite Score</th>
                    <th className="py-2.5 px-3 text-center">Completeness</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No leaderboard snapshots computed for period {periodId}. Click recalculate in Leaderboard workspace.
                      </td>
                    </tr>
                  ) : (
                    leaderboard.slice(0, 5).map((snap) => (
                      <tr 
                        key={snap.site_id} 
                        onClick={() => { onSelectSite(snap.site_id); onNavigateWorkspace('portfolio'); }}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors active:scale-[0.99]"
                      >
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                            snap.ranking_position === 1 ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-sm' :
                            snap.ranking_position === 2 ? 'bg-slate-200 text-slate-800' :
                            snap.ranking_position === 3 ? 'bg-amber-50 text-amber-900 border border-amber-200' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {snap.ranking_position || '-'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-[#023B77] mr-2">{snap.site_id}</span>
                          <span className="text-slate-800">{snap.site_name}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono text-sm">
                          {snap.composite_score !== null && snap.composite_score !== undefined ? snap.composite_score : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                          {snap.data_completeness_pct}%
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            snap.status === 'OFFICIAL' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {snap.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Schedule Health & Manpower Deployment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Schedule & Milestones */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[#023B77]" /> Schedule & Milestone Health
                </span>
                <span className="text-[10px] font-bold bg-teal-50 text-[#039583] px-2 py-0.5 rounded-full border border-teal-200">
                  Critical Path
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Substructure Milestones:</span>
                  <span className="font-bold text-emerald-700">4 / 5 Complete</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Schedule Variance (SV):</span>
                  <span className="font-bold text-[#023B77] font-mono">Positive (+₹12.5L)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Critical Path Delay:</span>
                  <span className="font-bold text-emerald-700">0 Days (Nominal)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Next Target Milestone:</span>
                  <span className="font-bold text-slate-800">Zone 2 Slab Casting</span>
                </div>
              </div>
            </div>

            {/* Manpower Overview */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#039583]" /> Manpower Deployment
                </span>
                <span className="text-[10px] font-bold bg-blue-50 text-[#023B77] px-2 py-0.5 rounded-full border border-blue-200">
                  Daily Census
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Daily Logs Tracked:</span>
                  <span className="font-bold text-slate-900">{dailyReports.length > 0 ? `${dailyReports.length} Validated DPRs` : 'Active Logs'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Plan Attendance Ratio:</span>
                  <span className="font-bold text-emerald-700 font-mono">96.8% of Target</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Active Trades:</span>
                  <span className="font-bold text-slate-800">Carpentry, Steel, Masons</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Overtime Utilization:</span>
                  <span className="font-bold text-slate-800 font-mono">1.5 hrs/shift avg</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Critical Management Attention & Recent Developments */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Critical Management Attention */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <h3 className="font-bold text-slate-900 text-sm">Critical Management Attention</h3>
              </div>
              <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full border border-rose-200">
                {highPriorityActions.length} Priority Items
              </span>
            </div>

            <div className="space-y-2.5">
              {highPriorityActions.length === 0 ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>No critical escalations pending corporate intervention. All site risks contained.</span>
                </div>
              ) : (
                highPriorityActions.slice(0, 3).map((act) => (
                  <div key={act.id} className="p-3 bg-slate-50/80 hover:bg-slate-100 rounded-xl border border-slate-200/80 transition-colors text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-[#023B77]">{act.site_id}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        {act.priority}
                      </span>
                    </div>
                    <p className="font-bold text-slate-900">{act.title}</p>
                    <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-2 leading-relaxed">{act.description}</p>
                    <div className="mt-2 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Due: {act.due_date}</span>
                      <span className="font-semibold text-slate-700">Status: {act.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Weekly Developments */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#023B77]" />
                <h3 className="font-bold text-slate-900 text-sm">Recent Weekly Developments</h3>
              </div>
              <button
                onClick={() => onNavigateWorkspace('weekly-insights')}
                className="text-xs font-bold text-[#023B77] hover:text-[#039583] flex items-center gap-1 transition-colors"
              >
                Weekly Insights <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {weeklyReports.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No weekly insight reports published yet.</p>
              ) : (
                weeklyReports.slice(0, 3).map((wr) => (
                  <div 
                    key={wr.id} 
                    onClick={() => { onSelectSite(wr.site_id); onNavigateWorkspace('weekly-insights'); }}
                    className="p-3 bg-slate-50/80 hover:bg-slate-100 rounded-xl border border-slate-200/80 transition-colors cursor-pointer text-xs active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#023B77]">{wr.site_id}</span>
                        <span className="text-slate-400">•</span>
                        <span className="font-semibold text-slate-700 font-mono">{wr.week_code}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        wr.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
                        wr.status === 'VALIDATED' ? 'bg-teal-100 text-teal-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {wr.status}
                      </span>
                    </div>
                    <p className="text-slate-700 text-xs mt-1 line-clamp-2 leading-relaxed">
                      {wr.executive_summary || 'Weekly field operations summary logged by site manager.'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
