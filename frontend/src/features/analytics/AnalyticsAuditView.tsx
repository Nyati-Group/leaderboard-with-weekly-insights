import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Upload, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  X,
  Activity,
  ShieldCheck,
  History
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  fetchPortfolioEvm, 
  fetchSiteEvm, 
  importExcelApi, 
  fetchAuditLogs,
  type PortfolioEVMResponse, 
  type SiteEVMRecord, 
  type AuditLogRecord,
  type UserProfile 
} from '../../services/api';

interface AnalyticsAuditViewProps {
  siteId: string;
  currentUser: UserProfile | null;
}

const formatCr = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '₹0 Cr';
  const cr = num / 10000000.0;
  return `₹${cr.toFixed(2)} Cr`;
};

export const AnalyticsAuditView: React.FC<AnalyticsAuditViewProps> = ({ siteId, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'evm' | 'audit'>('evm');
  const [portfolioData, setPortfolioData] = useState<PortfolioEVMResponse | null>(null);
  const [selectedSiteEvm, setSelectedSiteEvm] = useState<SiteEVMRecord | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Import Modal state
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargetSite, setImportTargetSite] = useState<string>(siteId === 'ALL' ? 'CS-PUN-01' : siteId);
  const [importing, setImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<any>(null);

  const canImport = currentUser?.roles.some(r => ['ORG_ADMIN', 'PROJECT_CONTROLLER', 'SITE_MANAGER'].includes(r));
  const canViewAudit = currentUser?.roles.some(r => ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER'].includes(r));

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [port, logs] = await Promise.all([
        fetchPortfolioEvm(),
        canViewAudit ? fetchAuditLogs(50, undefined, siteId === 'ALL' ? undefined : siteId).catch(() => []) : Promise.resolve([])
      ]);
      setPortfolioData(port);
      setAuditLogs(logs);

      if (siteId !== 'ALL') {
        const siteData = await fetchSiteEvm(siteId);
        setSelectedSiteEvm(siteData);
      } else if (port.site_breakdown.length > 0) {
        setSelectedSiteEvm(port.site_breakdown[0]);
      }
    } catch (err: any) {
      console.error('Error fetching analytics data:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load EVM analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [siteId]);

  const handleDownloadTemplate = () => {
    window.open('/api/v1/analytics/excel/template', '_blank');
  };

  const handleExportWorkbook = () => {
    window.open('/api/v1/analytics/excel/export?period_id=2026-W44', '_blank');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
      setImportResult(null);
    }
  };

  const handleExecuteImport = async (dryRun: boolean) => {
    if (!importFile) return;
    try {
      setImporting(true);
      setError(null);
      const res = await importExcelApi(importFile, importTargetSite, dryRun);
      setImportResult(res);
      if (!dryRun && res.valid) {
        await loadData();
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'object' && detail.errors) {
        setImportResult({ valid: false, errors: detail.errors });
      } else {
        setError(detail?.message || err.message || 'Excel processing failed.');
      }
    } finally {
      setImporting(false);
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
                <TrendingUp className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">Earned Value Management (EVM) & S-Curves</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Authoritative financial & schedule analytics: BAC, PV, EV, AC, SPI, CPI, and validated Excel ingestion.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
            >
              <Download className="w-3.5 h-3.5" /> Template (.xlsx)
            </button>

            <button
              onClick={handleExportWorkbook}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-teal-50 hover:bg-teal-100 text-[#039583] rounded-lg transition-colors border border-teal-200"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Portfolio (.xlsx)
            </button>

            {canImport && (
              <button
                onClick={() => { setShowImportModal(true); setImportResult(null); }}
                className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg shadow-sm transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Import Excel
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Apple Segmented Navigation Switcher */}
      <div className="flex bg-slate-200/70 backdrop-blur-md rounded-2xl p-1 shadow-sm text-xs font-semibold gap-1 border border-slate-300/40 w-fit">
        <button
          onClick={() => setActiveTab('evm')}
          className={`py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all active:scale-[0.99] ${
            activeTab === 'evm'
              ? 'bg-[#023B77] text-white shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Activity className="w-4 h-4" /> Earned Value & S-Curves
        </button>
        {canViewAudit && (
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all active:scale-[0.99] ${
              activeTab === 'audit'
                ? 'bg-[#023B77] text-white shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> System Audit Ledger ({auditLogs.length})
          </button>
        )}
      </div>

      {activeTab === 'evm' ? (
        <>
          {/* EVM Key Performance Cards */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#023B77]" />
              Computing Earned Value Management metrics...
            </div>
          ) : (
            <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* BAC Card */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Budget at Completion (BAC)</span>
              <p className="text-2xl font-black text-[#023B77] mt-1">
                {formatCr(selectedSiteEvm?.budget_at_completion || portfolioData?.portfolio_bac)}
              </p>
              <p className="text-xs text-slate-500 mt-1">Total authorized contract cost</p>
            </div>

            {/* Planned vs Earned Value */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Earned Value (EV)</span>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                {formatCr(selectedSiteEvm?.earned_value || portfolioData?.portfolio_ev)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                PV: {formatCr(selectedSiteEvm?.planned_value || portfolioData?.portfolio_pv)}
              </p>
            </div>

            {/* Actual Cost */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Actual Cost (AC)</span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {formatCr(selectedSiteEvm?.actual_cost || portfolioData?.portfolio_ac)}
              </p>
              <p className="text-xs text-slate-500 mt-1">Total recorded site expenditures</p>
            </div>

            {/* Performance Indices SPI / CPI */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Performance Indices</span>
              <div className="flex items-center gap-4 mt-1">
                <div>
                  <span className="text-xs text-slate-400">SPI: </span>
                  <span className={`text-xl font-black ${
                    (selectedSiteEvm?.schedule_performance_index || 1.0) >= 1.0 ? 'text-emerald-700' : 'text-amber-600'
                  }`}>
                    {selectedSiteEvm?.schedule_performance_index ?? portfolioData?.portfolio_spi}
                  </span>
                </div>
                <div className="h-6 w-[1px] bg-slate-200"></div>
                <div>
                  <span className="text-xs text-slate-400">CPI: </span>
                  <span className={`text-xl font-black ${
                    (selectedSiteEvm?.cost_performance_index || 1.0) >= 1.0 ? 'text-emerald-700' : 'text-amber-600'
                  }`}>
                    {selectedSiteEvm?.cost_performance_index ?? portfolioData?.portfolio_cpi}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {(selectedSiteEvm?.schedule_performance_index || 1.0) >= 1.0 ? 'Ahead of baseline schedule' : 'Schedule slippage detected'}
              </p>
            </div>
          </div>

          {/* S-Curve Chart Section */}
          {selectedSiteEvm && selectedSiteEvm.s_curve_points.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#023B77]" />
                    Project Baseline S-Curve: {selectedSiteEvm.site_name} ({selectedSiteEvm.site_id})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cumulative Planned Value (PV), Earned Value (EV), and Actual Cost (AC) over time.
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 font-bold text-[#023B77]">
                    <span className="w-3 h-1 bg-[#023B77] rounded"></span> Planned Value (PV)
                  </span>
                  <span className="flex items-center gap-1.5 font-bold text-emerald-600">
                    <span className="w-3 h-1 bg-emerald-600 rounded"></span> Earned Value (EV)
                  </span>
                  <span className="flex items-center gap-1.5 font-bold text-amber-600">
                    <span className="w-3 h-1 bg-amber-600 rounded"></span> Actual Cost (AC)
                  </span>
                </div>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedSiteEvm.s_curve_points} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      tickFormatter={(val) => `₹${(val / 10000000).toFixed(0)}Cr`}
                    />
                    <Tooltip 
                      formatter={(val: any) => formatCr(Number(val))}
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="pv" 
                      name="Planned Value (PV)" 
                      stroke="#023B77" 
                      strokeWidth={2.5} 
                      dot={{ r: 3 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="ev" 
                      name="Earned Value (EV)" 
                      stroke="#059669" 
                      strokeWidth={2.5} 
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="ac" 
                      name="Actual Cost (AC)" 
                      stroke="#d97706" 
                      strokeWidth={2.5} 
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Portfolio EVM Table */}
          {portfolioData && portfolioData.site_breakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Site-by-Site EVM Breakdown Roster</h3>
                  <p className="text-xs text-slate-500">Comparative index of schedule and cost performance across all active projects.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Site</th>
                      <th className="py-3 px-4 text-center">Progress %</th>
                      <th className="py-3 px-4 text-right">BAC</th>
                      <th className="py-3 px-4 text-right">Planned (PV)</th>
                      <th className="py-3 px-4 text-right">Earned (EV)</th>
                      <th className="py-3 px-4 text-right">Actual (AC)</th>
                      <th className="py-3 px-4 text-center">SPI</th>
                      <th className="py-3 px-4 text-center">CPI</th>
                      <th className="py-3 px-4 text-center">Health</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {portfolioData.site_breakdown.map((item) => (
                      <tr key={item.site_id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900">{item.site_name}</span>
                          <span className="block font-mono text-[11px] text-slate-400">{item.site_id}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-900">{item.progress_pct}%</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCr(item.budget_at_completion)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCr(item.planned_value)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">{formatCr(item.earned_value)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCr(item.actual_cost)}</td>
                        <td className="py-3 px-4 text-center font-mono font-black">
                          <span className={item.schedule_performance_index >= 1.0 ? 'text-emerald-700' : 'text-amber-600'}>
                            {item.schedule_performance_index}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-black">
                          <span className={item.cost_performance_index >= 1.0 ? 'text-emerald-700' : 'text-amber-600'}>
                            {item.cost_performance_index}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.health_status === 'EXCELLENT' ? 'bg-emerald-100 text-emerald-800' :
                            item.health_status === 'GOOD' ? 'bg-teal-100 text-teal-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.health_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedSiteEvm(item)}
                            className="px-2.5 py-1 text-xs font-semibold text-[#023B77] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                          >
                            View S-Curve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  ) : (
    /* Audit Ledger Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <History className="w-4 h-4 text-[#023B77]" />
                Immutable System Audit Ledger
              </h3>
              <p className="text-xs text-slate-500">
                Tamper-evident trail of security, field operational updates, and executive governance events.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 bg-slate-100 rounded text-slate-700">
              {auditLogs.length} Events Recorded
            </span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No audit events logged yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Site</th>
                    <th className="py-3 px-4">Resource</th>
                    <th className="py-3 px-4">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-blue-50 text-[#023B77] border border-blue-200">
                          {log.event_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {log.actor_name || 'System Actor'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {log.site_id || 'Portfolio / Global'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                        {log.resource_type} {log.resource_id ? `(${log.resource_id.slice(0, 8)}...)` : ''}
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-600 max-w-xs truncate">
                        {log.details_json ? JSON.stringify(log.details_json) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Excel Spreadsheet Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-lg w-full p-6 text-xs animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#023B77]" />
                  Import Field Operations Spreadsheet
                </h3>
                <p className="text-slate-500 mt-0.5">Strict row-by-row pre-validation before database commit.</p>
              </div>
              <button 
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Site</label>
                <select
                  aria-label="Target Site for Import"
                  value={importTargetSite}
                  onChange={(e) => setImportTargetSite(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-800"
                >
                  <option value="CS-PUN-01">CS-PUN-01 — Pune Commercial Tower</option>
                  <option value="CS-MUM-02">CS-MUM-02 — Mumbai Residential Complex</option>
                  <option value="CS-NAS-03">CS-NAS-03 — Nashik Industrial Facility</option>
                  <option value="CS-REM-04">CS-REM-04 — Remote Infrastructure Project</option>
                  <option value="CS-NAG-05">CS-NAG-05 — Nagpur Mixed-Use</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Upload Spreadsheet (.xlsx)</label>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-700 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-[#023B77] hover:file:bg-blue-100 cursor-pointer"
                />
              </div>

              {/* Validation Result Box */}
              {importResult && (
                <div className={`p-3.5 rounded-lg border text-xs ${
                  importResult.valid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <p className="font-bold flex items-center gap-1.5">
                    {importResult.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
                    {importResult.valid ? (importResult.dry_run ? 'Pre-Validation Passed' : 'Commit Successful') : 'Validation Rejection'}
                  </p>
                  <p className="mt-1">{importResult.message || 'Validation errors detected in file.'}</p>

                  {importResult.errors && (
                    <ul className="list-disc list-inside mt-2 space-y-0.5 text-[11px] font-mono">
                      {importResult.errors.map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleExecuteImport(true)}
                  disabled={!importFile || importing}
                  className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200 disabled:opacity-50"
                >
                  {importing ? 'Validating...' : '1. Run Dry-Run Check'}
                </button>

                <button
                  type="button"
                  onClick={() => handleExecuteImport(false)}
                  disabled={!importFile || importing || (importResult && !importResult.valid)}
                  className="px-4 py-1.5 bg-[#023B77] text-white rounded-lg font-bold hover:bg-[#012d5a] disabled:opacity-50"
                >
                  {importing ? 'Committing...' : '2. Commit to Database'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
