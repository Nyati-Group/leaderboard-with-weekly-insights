import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  X, 
  Send, 
  Sparkles, 
  Link as LinkIcon, 
  ChevronDown, 
  ChevronUp,
  RefreshCw,
  Key,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { 
  sendChatMessage, 
  syncChatbotContextApi,
  type ChatMessageItem, 
  type UserProfile,
  type ChatbotSyncResult
} from '../../services/api';

interface GovernedChatbotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  currentUser: UserProfile | null;
}

const QUICK_PROMPTS = [
  "What is the physical progress and 8-KRA rank for Pune Commercial Tower?",
  "Show safety compliance scores and recent field audits.",
  "What critical risks were highlighted in the latest weekly report?",
  "What is the EVM schedule performance index (SPI) and cost variance?",
  "Summarize daily contractor manpower deployment across all sites."
];

export const GovernedChatbotDrawer: React.FC<GovernedChatbotDrawerProps> = ({
  isOpen,
  onClose,
  siteId,
  currentUser
}) => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [expandedCitations, setExpandedCitations] = useState<Record<number, boolean>>({});
  
  // Gemini API Key State
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>('');

  // Knowledge Sync State
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome-1',
          sender: 'ASSISTANT',
          message_text: `👋 Hello ${currentUser?.full_name || 'Leader'}! I am your **Executive Construction AI Assistant**.\n\nI have complete real-time visibility across our multi-site portfolio, including physical progress logs, contractor manpower census, project expenditures, quality inspections, safety compliance, 8-KRA rankings, and executive weekly reports.\n\nEvery answer is strictly grounded in live platform records and approved engineering documents.`,
          citations_json: [
            {
              type: 'GOVERNANCE_RULE',
              reference: 'RULE-01',
              label: 'Authoritative RAG Grounding',
              details: 'Responses require direct database and verified document citations.'
            }
          ],
          created_at: new Date().toISOString()
        }
      ]);
    }
  }, [currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputValue;
    if (!text.trim() || loading) return;

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      sender: 'USER',
      message_text: text,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    try {
      const response = await sendChatMessage(
        text, 
        siteId, 
        conversationId,
        geminiApiKey.trim() || undefined
      );
      
      setConversationId(response.conversation_id);

      const assistantMsg: ChatMessageItem = {
        id: `assist-${Date.now()}`,
        sender: 'ASSISTANT',
        message_text: response.message,
        citations_json: response.citations,
        created_at: response.created_at
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessageItem = {
        id: `err-${Date.now()}`,
        sender: 'ASSISTANT',
        message_text: `⚠️ Error retrieving verified answer: ${err?.response?.data?.detail || err.message}`,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncKnowledge = async () => {
    try {
      setIsSyncing(true);
      const res: ChatbotSyncResult = await syncChatbotContextApi();
      setSyncFeedback(
        `Knowledge synced! Loaded ${res.sites_count} sites, ${res.daily_reports_count} daily logs, ${res.weekly_reports_count} weekly reports & ${res.quality_inspections_count + res.safety_inspections_count} audits.`
      );
      setTimeout(() => setSyncFeedback(null), 5000);
    } catch (err: any) {
      setSyncFeedback(`Sync failed: ${err?.message || 'Server error'}`);
      setTimeout(() => setSyncFeedback(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tempKey.trim();
    setGeminiApiKey(clean);
    if (clean) {
      localStorage.setItem('gemini_api_key', clean);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    setShowKeyModal(false);
    setSyncFeedback(clean ? 'Gemini API Key saved and active!' : 'Reset to platform synthesis engine.');
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  const toggleCitations = (index: number) => {
    setExpandedCitations(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[3px] transition-opacity duration-300 pointer-events-auto" 
        onClick={onClose} 
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-8 pointer-events-auto">
        <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col border-l border-slate-200/80">
          
          {/* Apple-styled Glass Header */}
          <div className="p-4 bg-gradient-to-r from-[#023B77] via-[#012d5a] to-[#023B77] text-white flex items-center justify-between shadow-md relative z-10">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-white/10 backdrop-blur-md rounded-xl text-teal-300 shadow-inner">
                <Bot className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 tracking-tight">
                  Executive Construction AI
                  <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                </h3>
                <p className="text-[11px] text-blue-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Authoritative RAG Grounding
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Reload / Sync Context Button */}
              <button
                onClick={handleSyncKnowledge}
                disabled={isSyncing}
                title="Reload and synchronize AI knowledge base with latest site updates"
                aria-label="Reload and synchronize AI knowledge base with latest site updates"
                className="flex items-center gap-1 text-[11px] font-semibold bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg border border-white/10 text-white transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none min-h-[36px] cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-teal-300' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Reload Data'}</span>
              </button>

              {/* Gemini Key Config Pill */}
              <button
                onClick={() => {
                  setTempKey(geminiApiKey);
                  setShowKeyModal(true);
                }}
                title="Configure Google Gemini API Key"
                aria-label="Configure Google Gemini API Key"
                className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:outline-none min-h-[36px] cursor-pointer ${
                  geminiApiKey 
                    ? 'bg-teal-500/20 border-teal-400/40 text-teal-200' 
                    : 'bg-white/10 border-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Key className="w-3 h-3" aria-hidden="true" />
                <span className="hidden sm:inline">{geminiApiKey ? 'Gemini 1.5' : 'Set Key'}</span>
              </button>

              <button 
                onClick={onClose} 
                className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors ml-1 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                title="Close AI Assistant Drawer"
                aria-label="Close AI Assistant Drawer"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Sync Notification Banner */}
          {syncFeedback && (
            <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in duration-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-medium text-[11px]">{syncFeedback}</span>
            </div>
          )}

          {/* Active Scope & Model Indicator */}
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span>Active Scope:</span>
              <span className="font-mono font-bold text-[#023B77] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                {siteId === 'ALL' ? 'Portfolio (5 Sites)' : siteId}
              </span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${geminiApiKey ? 'bg-teal-500' : 'bg-blue-500'}`} />
              <span className="font-medium">
                {geminiApiKey ? 'Gemini 1.5 Flash' : 'Deterministic RAG'}
              </span>
            </div>
          </div>

          {/* Quick Prompts Carousel */}
          <div className="p-2.5 bg-white border-b border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                disabled={loading}
                className="whitespace-nowrap px-3 py-1 bg-slate-50 hover:bg-blue-50/80 border border-slate-200/80 hover:border-[#023B77]/30 text-slate-700 hover:text-[#023B77] rounded-full text-[11px] font-medium transition-all shrink-0 active:scale-95"
              >
                {prompt.length > 34 ? prompt.slice(0, 34) + '...' : prompt}
              </button>
            ))}
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 text-xs">
            {messages.map((msg, idx) => {
              const isUser = msg.sender === 'USER';
              const citations = msg.citations_json || [];

              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[92%] p-3.5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] leading-relaxed ${
                      isUser
                        ? 'bg-[#023B77] text-white rounded-br-sm'
                        : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap font-sans">
                      {msg.message_text}
                    </div>

                    {/* Source Citations Accordion */}
                    {!isUser && citations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100">
                        <button
                          onClick={() => toggleCitations(idx)}
                          aria-expanded={expandedCitations[idx] ? true : false}
                          className="flex items-center justify-between w-full text-[11px] font-bold text-[#023B77] hover:underline cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <LinkIcon className="w-3 h-3 text-[#039583]" />
                            {citations.length} Authoritative Citations
                          </span>
                          {expandedCitations[idx] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {expandedCitations[idx] && (
                          <div className="mt-2 space-y-1.5 text-[10px]">
                            {citations.map((c, ci) => (
                              <div key={ci} className="p-2 bg-slate-50/80 rounded-lg border border-slate-200/80">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-[#023B77]">{c.label}</span>
                                  <span className="font-mono text-[9px] bg-teal-50 text-teal-800 px-1.5 py-0.5 rounded border border-teal-200 font-semibold">
                                    {c.type}
                                  </span>
                                </div>
                                <p className="text-slate-600 mt-1 leading-normal">{c.details}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400 mt-1 px-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 w-fit shadow-sm">
                <Sparkles className="w-4 h-4 text-[#039583] animate-spin" />
                <span>Grounded RAG synthesis in progress...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-3 bg-white border-t border-slate-200/80">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask about site progress, 8-KRA, manpower, costs, or safety..."
                aria-label="Type your construction intelligence question"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={loading}
                className="flex-1 p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#023B77] focus:ring-1 focus:ring-[#023B77] transition-all"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || loading}
                aria-label="Send message"
                className="p-2.5 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-xl transition-all active:scale-95 disabled:opacity-40 shadow-sm cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#023B77] focus-visible:outline-none"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              Responses are strictly grounded in active records & verified site documents.
            </p>
          </div>
        </div>
      </div>

      {/* Gemini API Key Modal */}
      {showKeyModal && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gemini-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-3">
              <h4 id="gemini-modal-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-[#023B77]" aria-hidden="true" />
                Google Gemini API Key
              </h4>
              <button 
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label="Close Gemini configuration modal"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-slate-600 mb-4 leading-relaxed">
              Enter your Google Gemini API key to enable advanced RAG multi-turn conversational intelligence. If omitted, the platform uses its deterministic grounded synthesis engine.
            </p>

            <form onSubmit={handleSaveApiKey} className="space-y-4">
              <div>
                <label htmlFor="gemini-key-input" className="block font-bold text-slate-700 mb-1">Gemini API Key</label>
                <input
                  id="gemini-key-input"
                  type="password"
                  placeholder="AIzaSy..."
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg outline-none font-mono text-xs focus:border-[#023B77] focus:ring-1 focus:ring-[#023B77]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setTempKey('');
                    setGeminiApiKey('');
                    localStorage.removeItem('gemini_api_key');
                    setShowKeyModal(false);
                    setSyncFeedback('Gemini API Key cleared.');
                    setTimeout(() => setSyncFeedback(null), 3000);
                  }}
                  className="text-rose-600 hover:underline font-semibold cursor-pointer py-1.5"
                >
                  Clear Key
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowKeyModal(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer min-h-[36px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-[#023B77] hover:bg-[#012d5a] text-white font-bold transition-all shadow-sm cursor-pointer min-h-[36px]"
                  >
                    Save Key
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
