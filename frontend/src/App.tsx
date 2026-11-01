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
  AlertCircle, 
  Lock, 
  LogOut, 
  UserCheck,
  ShieldCheck, 
  ArrowRight,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { 
  fetchSites, 
  loginApi,
  fetchMeApi,
  logoutApi,
  type SiteRecord,
  type UserProfile
} from './services/api';
import { FieldOperationsView } from './features/operations/FieldOperationsView';
import { QualitySafetyActionsView } from './features/quality-safety/QualitySafetyActionsView';
import { SiteLeaderboardView } from './features/rankings/SiteLeaderboardView';
import { WeeklyInsightsView } from './features/weekly-insights/WeeklyInsightsView';
import { AnalyticsAuditView } from './features/analytics/AnalyticsAuditView';
import { ExecutiveOverviewView } from './features/executive/ExecutiveOverviewView';
import { GovernedChatbotDrawer } from './features/chatbot/GovernedChatbotDrawer';

const WORKSPACES = [
  { id: 'executive', name: 'Executive Overview', icon: LayoutDashboard, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER'] },
  { id: 'portfolio', name: 'Site Leaderboard & Portfolio', icon: Trophy, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER'] },
  { id: 'weekly-insights', name: 'Weekly Insights', icon: CalendarDays, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER', 'SAFETY_OFFICER', 'QUALITY_OFFICER'] },
  { id: 'operations', name: 'Field Operations', icon: HardHat, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER'] },
  { id: 'quality-safety', name: 'Quality, Safety & Actions', icon: ShieldAlert, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER', 'SAFETY_OFFICER', 'QUALITY_OFFICER'] },
  { id: 'analytics-audit', name: 'Analytics & Audit Ledger', icon: FileSpreadsheet, requiredRoles: ['ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER'] },
];

const ACCOUNT_CATEGORIES = [
  {
    id: 'gov',
    label: 'Corporate Leadership',
    accounts: [
      { email: 'admin@cld.com', name: 'Rajesh Sharma', role: 'Organization Administrator', scope: 'Global / All Sites' },
      { email: 'leadership@cld.com', name: 'Vikramaditya Roy', role: 'Executive Leadership', scope: 'Global Oversight' },
      { email: 'controller@cld.com', name: 'Meera Nambiar', role: 'Project Controller', scope: 'Multi-Site Governance' }
    ]
  },
  {
    id: 'pm',
    label: 'Site Managers',
    accounts: [
      { email: 'pm.pune@cld.com', name: 'Amitabh Joshi', role: 'Site Manager', scope: 'Pune Commercial Tower' },
      { email: 'pm.mumbai@cld.com', name: 'Anil Deshmukh', role: 'Site Manager', scope: 'Mumbai Residential Complex' },
      { email: 'pm.nashik@cld.com', name: 'Pravin Patil', role: 'Site Manager', scope: 'Nashik Industrial Facility' },
      { email: 'pm.remote@cld.com', name: 'Sunil Rana', role: 'Site Manager', scope: 'Remote Infrastructure Project' },
      { email: 'pm.nagpur@cld.com', name: 'Sanjay Meshram', role: 'Site Manager', scope: 'Nagpur Mixed-Use' }
    ]
  },
  {
    id: 'safety',
    label: 'Safety Officers',
    accounts: [
      { email: 'safety.pune@cld.com', name: 'Nikhil Kadam', role: 'Safety Officer', scope: 'Pune Commercial Tower' },
      { email: 'safety.mumbai@cld.com', name: 'Karan Verma', role: 'Safety Officer', scope: 'Mumbai Residential Complex' },
      { email: 'safety.nashik@cld.com', name: 'Rohan Gaikwad', role: 'Safety Officer', scope: 'Nashik Industrial Facility' },
      { email: 'safety.remote@cld.com', name: 'Major R. K. Thapa', role: 'Safety Officer', scope: 'Remote Infrastructure Project' },
      { email: 'safety.nagpur@cld.com', name: 'Ashish Wankhede', role: 'Safety Officer', scope: 'Nagpur Mixed-Use' }
    ]
  },
  {
    id: 'quality',
    label: 'Quality Officers',
    accounts: [
      { email: 'quality.pune@cld.com', name: 'Sneha Sawant', role: 'Quality Officer', scope: 'Pune Commercial Tower' },
      { email: 'quality.mumbai@cld.com', name: 'Pooja Kulkarni', role: 'Quality Officer', scope: 'Mumbai Residential Complex' },
      { email: 'quality.nashik@cld.com', name: 'Ganesh Shinde', role: 'Quality Officer', scope: 'Nashik Industrial Facility' },
      { email: 'quality.remote@cld.com', name: 'Deepak Bhandari', role: 'Quality Officer', scope: 'Remote Infrastructure Project' },
      { email: 'quality.nagpur@cld.com', name: 'Madhuri Tijare', role: 'Quality Officer', scope: 'Nagpur Mixed-Use' }
    ]
  }
];

export function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState('executive');
  const [selectedSiteId, setSelectedSiteId] = useState('ALL');
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('admin@cld.com');
  const [loginPassword, setLoginPassword] = useState('Construction@2026');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeAccountTab, setActiveAccountTab] = useState('gov');

  // Initialize Session
  useEffect(() => {
    async function init() {
      try {
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

  // User Initials helper
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  // If not authenticated, render Apple-styled Login Experience
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0a1120] flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 font-sans selection:bg-[#039583] selection:text-white">
        
        {/* Subtle Ambient Background Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#023B77]/30 to-[#039583]/20 blur-[120px] pointer-events-none rounded-full" />

        <div className="w-full max-w-xl bg-slate-900/80 backdrop-blur-2xl rounded-3xl border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden p-6 sm:p-8 relative z-10">
          
          {/* Brand Header */}
          <div className="flex items-center gap-3.5 mb-6">
            <div className="bg-gradient-to-br from-[#023B77] to-[#039583] p-3 rounded-2xl shadow-md border border-white/10">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Construction Site Leadership</h1>
              <p className="text-xs text-slate-400">Enterprise Multi-Site Operations & Intelligence</p>
            </div>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-200 flex items-center gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
              <input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="w-full bg-slate-950/60 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#039583] focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
              <input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="w-full bg-slate-950/60 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#039583] focus:border-transparent transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-gradient-to-r from-[#023B77] to-[#039583] hover:from-[#012d5a] hover:to-[#027466] text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#039583] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {authLoading ? 'Verifying Credentials...' : 'Sign In'} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>

          {/* Segmented Preset Accounts Drawer */}
          <div className="mt-8 pt-5 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#039583]" /> Seed Accounts
              </span>
              <span className="text-[11px] text-slate-500">Click to switch identity</span>
            </div>

            {/* Apple Segmented Category Controller */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800/80 mb-3 text-[11px]">
              {ACCOUNT_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveAccountTab(cat.id)}
                  className={`py-1.5 px-2 rounded-lg font-medium transition-all text-center truncate ${
                    activeAccountTab === cat.id
                      ? 'bg-slate-800 text-white shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Account List for Active Tab */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {ACCOUNT_CATEGORIES.find(c => c.id === activeAccountTab)?.accounts.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setLoginEmail(acc.email);
                    handleLogin(undefined, acc.email);
                  }}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/50 hover:border-slate-700 transition-all flex items-center justify-between group active:scale-[0.99]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200 text-xs group-hover:text-white transition-colors">
                        {acc.name}
                      </span>
                      <span className="text-[10px] text-slate-400">({acc.role})</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono block mt-0.5">{acc.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-teal-300 border border-slate-800">
                      {acc.scope}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-900 font-sans antialiased overflow-hidden selection:bg-[#023B77] selection:text-white">
      
      {/* Apple-style Translucent Sidebar Navigation */}
      <aside className="w-64 bg-[#023B77] text-white flex flex-col shadow-xl z-20 shrink-0 border-r border-[#01254d]">
        
        {/* Brand Header */}
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <div className="bg-gradient-to-br from-[#039583] to-[#027466] p-2 rounded-xl shadow-md border border-white/15">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight leading-tight text-white">Construction Leadership</h1>
            <p className="text-[11px] text-teal-200/80 font-mono">Platform v1.0</p>
          </div>
        </div>

        {/* Workspaces Menu */}
        <div className="p-3 flex-1 overflow-y-auto">
          <p className="px-3 py-2 text-[11px] font-semibold tracking-wider uppercase text-blue-200/60">
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
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left group active:scale-[0.98] ${
                    isActive
                      ? 'bg-white/15 text-white shadow-sm backdrop-blur-md border border-white/20'
                      : isPermitted
                        ? 'text-blue-100 hover:bg-white/10 hover:text-white'
                        : 'text-blue-300/30 cursor-not-allowed opacity-40'
                  }`}
                  title={!isPermitted ? 'Access restricted by your organizational role policy' : undefined}
                >
                  <Icon className={`w-4 h-4 transition-transform group-hover:scale-105 ${
                    isActive ? 'text-teal-300' : isPermitted ? 'text-blue-200' : 'text-blue-300/30'
                  }`} />
                  <span className="truncate">{ws.name}</span>
                  {!isPermitted && <Lock className="w-3 h-3 ml-auto text-blue-300/40" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Organization Brand Footer Card */}
        <div className="p-3.5 border-t border-white/10 bg-[#01254d]/60 text-xs">
          <div className="flex items-center justify-between text-blue-100">
            <span className="font-semibold text-white tracking-tight">Enterprise Operations</span>
            <span className="text-[10px] bg-teal-400/20 text-teal-200 px-2 py-0.5 rounded-full font-mono font-medium">5 Sites</span>
          </div>
          <p className="text-[11px] text-blue-200/70 mt-0.5">Authoritative Governed Ledger</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Apple-styled Top Header */}
        <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between px-6 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">
              Site Scope:
            </span>
            
            {/* RBAC-Enforced Site Dropdown */}
            {currentUser.has_global_scope ? (
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-[#023B77] transition-all cursor-pointer shadow-sm"
              >
                <option value="ALL">All Portfolio Sites ({sites.length} Active)</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.id} - {site.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 text-[#023B77] px-3 py-1.5 rounded-lg text-xs font-bold font-mono shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-[#039583]" />
                <span>{selectedSiteId}</span>
                <span className="text-slate-600 font-sans font-medium">
                  ({sites.find(s => s.id === selectedSiteId)?.name || 'Assigned Project'})
                </span>
                <span className="bg-teal-200/70 text-teal-900 text-[9px] px-1.5 py-0.2 rounded font-sans font-semibold">
                  Locked
                </span>
              </div>
            )}

            <span className="bg-slate-100 text-slate-700 border border-slate-200 text-xs px-2.5 py-1 rounded-lg font-semibold font-mono">
              Period: 2026-W44
            </span>
          </div>

          {/* User Profile & Logout */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-900 tracking-tight">{currentUser.full_name}</p>
              <p className="text-[11px] text-slate-500 flex items-center justify-end gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>{currentUser.roles.join(', ')}</span>
                <span className="text-slate-300">•</span>
                <span className="font-medium text-slate-600">{currentUser.has_global_scope ? 'Global Scope' : 'Site Scoped'}</span>
              </p>
            </div>

            {/* User Initials Avatar */}
            <div className="w-8 h-8 rounded-full bg-[#023B77] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {getInitials(currentUser.full_name)}
            </div>
            
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all border border-slate-200/80 active:scale-95 focus-visible:ring-2 focus-visible:ring-[#023B77] focus-visible:outline-none min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
              title="Sign out of current account"
              aria-label="Sign out of current account"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Workspace Canvas */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#f8fafc]">
          {/* Header Bar */}
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {WORKSPACES.find((w) => w.id === activeWorkspace)?.name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedSiteId === 'ALL' 
                  ? 'Consolidated multi-site leadership view across active portfolio' 
                  : `Site-specific view for ${activeSite?.name} (${activeSite?.id})`}
              </p>
            </div>
          </div>

          {activeWorkspace === 'executive' ? (
            <ExecutiveOverviewView
              currentUser={currentUser}
              onNavigateWorkspace={(ws) => setActiveWorkspace(ws)}
              onSelectSite={(sId) => setSelectedSiteId(sId)}
            />
          ) : activeWorkspace === 'portfolio' ? (
            <SiteLeaderboardView
              currentUser={currentUser}
              onSelectSite={(sId) => setSelectedSiteId(sId)}
            />
          ) : activeWorkspace === 'weekly-insights' ? (
            <WeeklyInsightsView
              siteId={selectedSiteId}
              currentUser={currentUser}
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
          ) : activeWorkspace === 'analytics-audit' ? (
            <AnalyticsAuditView
              siteId={selectedSiteId}
              currentUser={currentUser}
            />
          ) : (
            <ExecutiveOverviewView
              currentUser={currentUser}
              onNavigateWorkspace={(ws) => setActiveWorkspace(ws)}
              onSelectSite={(sId) => setSelectedSiteId(sId)}
            />
          )}
        </main>
      </div>

      {/* Floating Chatbot Assistant Trigger */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="bg-gradient-to-r from-[#023B77] to-[#039583] hover:from-[#012d5a] hover:to-[#027466] text-white px-4 py-3 rounded-full shadow-xl flex items-center gap-2 transition-all hover:scale-105 active:scale-95 focus-visible:ring-4 focus-visible:ring-teal-300/50 focus-visible:outline-none border border-white/20 min-h-[44px] cursor-pointer"
          title="Open Governed AI Assistant"
          aria-label="Open Governed AI Assistant"
        >
          <Bot className="w-5 h-5 text-teal-300" aria-hidden="true" />
          <span className="text-xs font-bold tracking-tight">AI Assistant</span>
          <Sparkles className="w-3.5 h-3.5 text-teal-200" aria-hidden="true" />
        </button>

        <GovernedChatbotDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          siteId={selectedSiteId}
          currentUser={currentUser}
        />
      </div>
    </div>
  );
}

export default App;
