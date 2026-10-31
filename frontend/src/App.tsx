import { useState, useEffect } from 'react';
import { 
  Building2, 
  LayoutDashboard, 
  Trophy, 
  CalendarDays, 
  HardHat, 
  ShieldAlert, 
  FileSpreadsheet, 
  Bot, 
  CheckCircle2, 
  AlertCircle, 
  Database, 
  Server, 
  Layers,
  MapPin,
  Briefcase,
  IndianRupee,
  Calendar
} from 'lucide-react';
import { 
  fetchHealth, 
  fetchDbHealth, 
  fetchSites, 
  type HealthStatus, 
  type DbHealthStatus, 
  type SiteRecord 
} from './services/api';

const WORKSPACES = [
  { id: 'executive', name: 'Executive Overview', icon: LayoutDashboard },
  { id: 'portfolio', name: 'Site Leaderboard & Portfolio', icon: Trophy },
  { id: 'weekly-insights', name: 'Weekly Insights', icon: CalendarDays },
  { id: 'operations', name: 'Field Operations', icon: HardHat },
  { id: 'quality-safety', name: 'Quality, Safety & Actions', icon: ShieldAlert },
  { id: 'analytics-audit', name: 'Analytics & Audit Ledger', icon: FileSpreadsheet },
];

export function App() {
  const [activeWorkspace, setActiveWorkspace] = useState('executive');
  const [selectedSiteId, setSelectedSiteId] = useState('ALL');
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [backendHealth, setBackendHealth] = useState<HealthStatus | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const [health, db, sitesData] = await Promise.all([
          fetchHealth().catch(err => ({ status: 'offline: ' + err.message, environment: 'offline', version: 'unknown', project: 'unavailable' })),
          fetchDbHealth().catch(err => ({ status: 'offline: ' + err.message, database_url: 'unavailable' })),
          fetchSites().catch(() => [])
        ]);
        setBackendHealth(health as HealthStatus);
        setDbHealth(db as DbHealthStatus);
        setSites(sitesData);
      } catch (err: any) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  const activeSite = sites.find(s => s.id === selectedSiteId);

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return 'N/A';
    const cr = val / 10000000;
    return `₹${cr.toFixed(2)} Cr`;
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#023B77] text-white flex flex-col shadow-xl">
        {/* Brand Header */}
        <div className="p-5 border-b border-blue-900/40 flex items-center gap-3">
          <div className="bg-[#039583] p-2 rounded-lg shadow-sm">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight leading-tight text-white">Site Leadership</h1>
            <p className="text-xs text-blue-200 font-mono">Platform v1.0</p>
          </div>
        </div>

        {/* Workspaces Menu */}
        <div className="p-3">
          <p className="px-3 py-2 text-[11px] font-semibold tracking-wider uppercase text-blue-300/80">
            Workspaces
          </p>
          <nav className="space-y-1">
            {WORKSPACES.map((ws) => {
              const Icon = ws.icon;
              const isActive = activeWorkspace === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => setActiveWorkspace(ws.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    isActive
                      ? 'bg-white/10 text-white shadow-sm font-semibold border-l-4 border-[#039583]'
                      : 'text-blue-100 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#039583]' : 'text-blue-200'}`} />
                  <span className="truncate">{ws.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Health Status in Sidebar Footer */}
        <div className="mt-auto p-4 border-t border-blue-900/40 bg-[#012852]/60 text-xs space-y-2">
          <div className="flex items-center justify-between text-blue-200">
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-300" /> API Gateway
            </span>
            {backendHealth?.status === 'healthy' ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> {loading ? 'Checking...' : 'Standby'}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-blue-200">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-300" /> PostgreSQL
            </span>
            {dbHealth?.status === 'connected' ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> {loading ? 'Checking...' : 'Standby'}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Site Scope:
            </label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-md px-3 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-[#039583]"
            >
              <option value="ALL">All Portfolio Sites ({sites.length} Active)</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.id} - {site.name}
                </option>
              ))}
            </select>

            <span className="bg-blue-50 text-[#023B77] border border-blue-200 text-xs px-2.5 py-1 rounded-full font-semibold">
              Period: 2026-W44
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800">Org Administrator</p>
              <p className="text-xs text-slate-500">Corporate HQ • Global Scope</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#023B77] text-white flex items-center justify-center font-bold text-sm shadow-sm">
              OA
            </div>
          </div>
        </header>

        {/* Workspace Canvas */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {/* Header Bar */}
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {WORKSPACES.find((w) => w.id === activeWorkspace)?.name}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {selectedSiteId === 'ALL' 
                  ? 'Consolidated portfolio view across all construction sites' 
                  : `Site-specific view for ${activeSite?.name} (${activeSite?.id})`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-md text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Phase 1 Foundation Verified
              </span>
            </div>
          </div>

          {/* Quick Metrics & System Diagnostics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Configured Sites</p>
              <p className="text-2xl font-bold text-[#023B77] mt-1">{sites.length} Sites</p>
              <p className="text-xs text-slate-500 mt-1">Authoritative DB seeded</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Ranking Engine</p>
              <p className="text-2xl font-bold text-[#039583] mt-1">8-KRA v1.0</p>
              <p className="text-xs text-slate-500 mt-1">Deterministic composite methodology</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">Security & RBAC</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">6 Active Roles</p>
              <p className="text-xs text-slate-500 mt-1">Admin, Exec, Controller, SM, SO, QO</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">AI Assistant</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">Governed</p>
              <p className="text-xs text-slate-500 mt-1">Grounded in DB & approved documents</p>
            </div>
          </div>

          {/* Active Site Spotlight or Portfolio Grid */}
          {selectedSiteId !== 'ALL' && activeSite ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div>
                  <span className="text-xs font-mono font-bold text-[#039583] bg-teal-50 px-2.5 py-1 rounded border border-teal-200">
                    {activeSite.id}
                  </span>
                  <h3 className="text-xl font-bold text-slate-900 mt-2">{activeSite.name}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> {activeSite.location}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">
                    {activeSite.status}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">{activeSite.project_type}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-[#023B77]" /> Client
                  </p>
                  <p className="font-bold text-slate-800 mt-1 text-sm">{activeSite.metadata?.client_name || 'N/A'}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <IndianRupee className="w-3.5 h-3.5 text-emerald-600" /> Contract Value
                  </p>
                  <p className="font-bold text-emerald-700 mt-1 text-sm">{formatCurrency(activeSite.metadata?.contract_value)}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <IndianRupee className="w-3.5 h-3.5 text-blue-600" /> Budgeted Cost
                  </p>
                  <p className="font-bold text-blue-800 mt-1 text-sm">{formatCurrency(activeSite.metadata?.budgeted_cost)}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" /> Timeline
                  </p>
                  <p className="font-bold text-slate-800 mt-1">{activeSite.start_date} to {activeSite.target_completion_date}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#023B77]" />
                Configured Portfolio Sites (PostgreSQL Authoritative Roster)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {sites.map((site) => (
                  <div 
                    key={site.id}
                    onClick={() => setSelectedSiteId(site.id)}
                    className="p-4 bg-slate-50 hover:bg-white rounded-lg border border-slate-200 hover:border-[#039583] hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-[#023B77] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {site.id}
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        {site.status}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm mt-2">{site.name}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-slate-400" /> {site.location}
                    </p>
                    <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">{site.project_type}</span>
                      <span className="font-semibold text-slate-700">{formatCurrency(site.metadata?.contract_value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Foundation Health & Architecture Diagnostics Panel */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#023B77]" />
              Modular Monolith Foundation & Telemetry
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#023B77]" /> Backend API Status
                </h4>
                <div className="space-y-1 text-xs">
                  <p><span className="text-slate-500">Service:</span> <span className="font-mono font-medium">{backendHealth?.project || 'Checking...'}</span></p>
                  <p><span className="text-slate-500">Version:</span> <span className="font-mono font-medium">{backendHealth?.version || 'N/A'}</span></p>
                  <p><span className="text-slate-500">Environment:</span> <span className="font-mono font-medium">{backendHealth?.environment || 'development'}</span></p>
                  <p><span className="text-slate-500">Health Status:</span> <span className="font-semibold text-emerald-600 uppercase">{backendHealth?.status || 'Connecting...'}</span></p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#039583]" /> Database Connection
                </h4>
                <div className="space-y-1 text-xs">
                  <p><span className="text-slate-500">Engine:</span> <span className="font-mono font-medium">PostgreSQL 16 (Relational + pgvector)</span></p>
                  <p><span className="text-slate-500">Target DB:</span> <span className="font-mono font-medium">{dbHealth?.database_url || 'cld_db'}</span></p>
                  <p><span className="text-slate-500">State:</span> <span className="font-semibold text-emerald-600 uppercase">{dbHealth?.status || 'Testing...'}</span></p>
                  <p><span className="text-slate-500">Migrations:</span> <span className="font-mono font-medium">Alembic Version Controlled</span></p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Floating Chatbot Assistant Trigger */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="bg-[#039583] hover:bg-[#027466] text-white p-3.5 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-teal-300"
          title="Open AI Construction Assistant"
        >
          <Bot className="w-6 h-6" />
        </button>

        {/* Chatbot Window Flyout */}
        {isChatOpen && (
          <div className="absolute bottom-16 right-0 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[480px]">
            <div className="bg-[#023B77] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-[#039583]" />
                <div>
                  <h4 className="text-sm font-bold">Construction AI Assistant</h4>
                  <p className="text-[10px] text-blue-200">Grounded in approved site data & drawings</p>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="text-white/70 hover:text-white text-xs px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50 text-xs">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-slate-700">
                <p className="font-semibold text-[#023B77] mb-1">AI Assistant Initialized</p>
                <p>
                  I am connected to the authoritative database and approved project baselines.
                  Ask me questions about site progress, KRA rankings, delayed milestones, or safety observations.
                </p>
                <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                  Strictly governed: No unrestricted SQL or speculative responses.
                </div>
              </div>
            </div>

            <div className="p-3 bg-white border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ask a question about current sites..."
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#039583]"
                />
                <button className="bg-[#039583] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#027466]">
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
