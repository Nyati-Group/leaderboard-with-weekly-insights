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
  MapPin,
  Briefcase,
  IndianRupee,
  Calendar,
  Lock,
  LogOut,
  UserCheck,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { 
  fetchHealth, 
  fetchDbHealth, 
  fetchSites, 
  loginApi,
  fetchMeApi,
  logoutApi,
  type HealthStatus, 
  type DbHealthStatus, 
  type SiteRecord,
  type UserProfile
} from './services/api';
import { FieldOperationsView } from './features/operations/FieldOperationsView';
import { QualitySafetyActionsView } from './features/quality-safety/QualitySafetyActionsView';
import { SiteLeaderboardView } from './features/rankings/SiteLeaderboardView';

const WORKSPACES = [
  { id: 'executive', name: 'Executive Overview', icon: LayoutDashboard, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER'] },
  { id: 'portfolio', name: 'Site Leaderboard & Portfolio', icon: Trophy, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER'] },
  { id: 'weekly-insights', name: 'Weekly Insights', icon: CalendarDays, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER', 'SAFETY_OFFICER', 'QUALITY_OFFICER'] },
  { id: 'operations', name: 'Field Operations', icon: HardHat, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER'] },
  { id: 'quality-safety', name: 'Quality, Safety & Actions', icon: ShieldAlert, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER', 'SAFETY_OFFICER', 'QUALITY_OFFICER'] },
  { id: 'analytics-audit', name: 'Analytics & Audit Ledger', icon: FileSpreadsheet, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER'] },
];

const DEV_ACCOUNTS = [
  { email: 'admin@cld.com', role: 'Organization Admin', scope: 'Global / All Sites' },
  { email: 'leadership@cld.com', role: 'Executive Leadership', scope: 'Global Read-Only' },
  { email: 'controller@cld.com', role: 'Project Controller', scope: 'Multi-Site Governance' },
  { email: 'pm.pune@cld.com', role: 'Site Manager (Pune)', scope: 'Restricted: CS-PUN-01' },
  { email: 'safety.pune@cld.com', role: 'Safety Officer (Pune)', scope: 'Restricted: CS-PUN-01' },
  { email: 'quality.pune@cld.com', role: 'Quality Officer (Pune)', scope: 'Restricted: CS-PUN-01' },
  { email: 'pm.mumbai@cld.com', role: 'Site Manager (Mumbai)', scope: 'Restricted: CS-MUM-02' },
];

export function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState('executive');
  const [selectedSiteId, setSelectedSiteId] = useState('ALL');
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [backendHealth, setBackendHealth] = useState<HealthStatus | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('admin@cld.com');
  const [loginPassword, setLoginPassword] = useState('Construction@2026');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Initialize System and Session
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [health, db] = await Promise.all([
          fetchHealth().catch(err => ({ status: 'offline: ' + err.message, environment: 'offline', version: 'unknown', project: 'unavailable' })),
          fetchDbHealth().catch(err => ({ status: 'offline: ' + err.message, database_url: 'unavailable' })),
        ]);
        setBackendHealth(health as HealthStatus);
        setDbHealth(db as DbHealthStatus);

        // Check if existing token in localStorage
        const token = localStorage.getItem('cld_access_token');
        if (token) {
          try {
            const user = await fetchMeApi();
            setCurrentUser(user);
            await loadAuthorizedSites(user);
          } catch {
            localStorage.removeItem('cld_access_token');
            setCurrentUser(null);
          }
        }
      } catch (err: any) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const loadAuthorizedSites = async (user: UserProfile) => {
    try {
      const sitesData = await fetchSites();
      setSites(sitesData);
      if (!user.has_global_scope && user.assigned_site_ids.length > 0) {
        setSelectedSiteId(user.assigned_site_ids[0]);
      } else {
        setSelectedSiteId('ALL');
      }
    } catch (err) {
      console.error('Failed to load sites:', err);
    }
  };

  const handleLogin = async (e?: React.FormEvent, customEmail?: string) => {
    if (e) e.preventDefault();
    const emailToUse = customEmail || loginEmail;
    try {
      setAuthLoading(true);
      setAuthError(null);
      const res = await loginApi(emailToUse, loginPassword);
      setCurrentUser(res.user);
      await loadAuthorizedSites(res.user);
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || err.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } finally {
      setCurrentUser(null);
      setSites([]);
    }
  };

  const activeSite = sites.find(s => s.id === selectedSiteId);

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return 'N/A';
    const cr = val / 10000000;
    return `₹${cr.toFixed(2)} Cr`;
  };

  // If not authenticated, render Login Modal / Screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-6 text-slate-100 font-sans">
        <div className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-[#039583] p-2.5 rounded-xl shadow-md">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Construction Site Leadership</h1>
              <p className="text-xs text-blue-200 font-mono">Enterprise Intelligence & RBAC</p>
            </div>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 mb-6 text-xs text-slate-300">
            <p className="font-semibold text-white flex items-center gap-1.5 mb-1">
              <Lock className="w-3.5 h-3.5 text-[#039583]" /> 3-Tier Security & Site Isolation
            </p>
            <p>Sign in with your email and password to access authorized sites and workspace records.</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-950/80 border border-red-800 rounded-lg text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Email Address</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#039583]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#039583]"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-[#039583] hover:bg-[#027466] text-white font-bold py-2.5 rounded-lg text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              {authLoading ? 'Verifying Credentials...' : 'Sign In'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick-Fill Presets for Test Accounts */}
          <div className="mt-8 pt-6 border-t border-slate-700">
            <p className="text-[11px] font-semibold uppercase text-slate-400 mb-3 tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-blue-400" /> Auditable Seed Test Accounts
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {DEV_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setLoginEmail(acc.email);
                    handleLogin(undefined, acc.email);
                  }}
                  className="w-full text-left p-2 rounded-lg bg-slate-900/40 hover:bg-slate-700/60 border border-slate-700/60 transition-all flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-white block">{acc.role}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{acc.email}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                    {acc.scope}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              const isPermitted = ws.requiredRoles.some(r => currentUser.roles.includes(r));

              return (
                <button
                  key={ws.id}
                  disabled={!isPermitted}
                  onClick={() => setActiveWorkspace(ws.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    isActive
                      ? 'bg-white/10 text-white shadow-sm font-semibold border-l-4 border-[#039583]'
                      : isPermitted
                        ? 'text-blue-100 hover:bg-white/5 hover:text-white'
                        : 'text-blue-300/40 cursor-not-allowed opacity-50'
                  }`}
                  title={!isPermitted ? 'Access restricted by your role policy' : undefined}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#039583]' : isPermitted ? 'text-blue-200' : 'text-blue-400/40'}`} />
                  <span className="truncate">{ws.name}</span>
                  {!isPermitted && <Lock className="w-3 h-3 ml-auto text-blue-300/40" />}
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
              Site Scope:
            </label>
            
            {/* RBAC-Enforced Site Dropdown */}
            {currentUser.has_global_scope ? (
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
            ) : (
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-300 text-[#023B77] px-3 py-1.5 rounded-md text-xs font-bold font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-[#039583]" />
                <span>{selectedSiteId}</span>
                <span className="text-slate-500 font-sans font-normal">
                  ({sites.find(s => s.id === selectedSiteId)?.name || 'Assigned Site'})
                </span>
                <span className="bg-teal-200 text-teal-800 text-[10px] px-1.5 py-0.5 rounded uppercase font-sans font-semibold">
                  Locked
                </span>
              </div>
            )}

            <span className="bg-blue-50 text-[#023B77] border border-blue-200 text-xs px-2.5 py-1 rounded-full font-semibold">
              Period: 2026-W44
            </span>
          </div>

          {/* User Profile & Logout */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-800">{currentUser.full_name}</p>
              <p className="text-xs text-slate-500 flex items-center justify-end gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {currentUser.roles.join(', ')} • {currentUser.has_global_scope ? 'Global Scope' : 'Site Scoped'}
              </p>
            </div>
            
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all border border-slate-200"
              title="Sign out of current account"
            >
              <LogOut className="w-4 h-4" />
            </button>
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
                <ShieldCheck className="w-3.5 h-3.5" /> 3-Tier RBAC Active
              </span>
            </div>
          </div>

          {activeWorkspace === 'portfolio' ? (
            <SiteLeaderboardView
              currentUser={currentUser}
              onSelectSite={(sId) => setSelectedSiteId(sId)}
            />
          ) : activeWorkspace === 'operations' ? (
            <FieldOperationsView 
              siteId={selectedSiteId === 'ALL' ? (sites[0]?.id || 'CS-PUN-01') : selectedSiteId} 
              currentUser={currentUser} 
            />
          ) : activeWorkspace === 'quality-safety' ? (
            <QualitySafetyActionsView
              siteId={selectedSiteId === 'ALL' ? (sites[0]?.id || 'CS-PUN-01') : selectedSiteId}
              currentUser={currentUser}
            />
          ) : (
            <>
              {/* User Session Diagnostics Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 text-[#023B77] p-2.5 rounded-lg border border-blue-100">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold">Active Authentication Context</p>
                    <p className="text-sm font-bold text-slate-900">{currentUser.email} ({currentUser.full_name})</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Assigned Roles: </span>
                    <span className="font-semibold text-[#023B77]">{currentUser.roles.join(', ')}</span>
                  </div>
                  <div className="h-4 w-[1px] bg-slate-200"></div>
                  <div>
                    <span className="text-slate-400">Authorized Sites: </span>
                    <span className="font-semibold text-emerald-700">
                      {currentUser.has_global_scope ? 'All 5 Sites (Global)' : currentUser.assigned_site_ids.join(', ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Metrics & System Diagnostics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-semibold uppercase text-slate-400">Accessible Sites</p>
                  <p className="text-2xl font-bold text-[#023B77] mt-1">{sites.length} Sites</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {currentUser.has_global_scope ? 'Full portfolio authority' : 'Locked to assigned site'}
                  </p>
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
                    Accessible Sites Roster ({sites.length} Authorized)
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
            </>
          )}
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
                  Authenticated as <span className="font-semibold">{currentUser.full_name}</span> ({currentUser.roles.join(', ')}).
                  Queries are permission-filtered to your authorized sites.
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
