import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  X, 
  Send, 
  Sparkles, 
  Link as LinkIcon, 
  ChevronDown, 
  ChevronUp
} from 'lucide-react';
import { 
  sendChatMessage, 
  type ChatMessageItem, 
  type UserProfile 
} from '../../services/api';

interface GovernedChatbotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  currentUser: UserProfile | null;
}

const QUICK_PROMPTS = [
  "What is the physical progress and 8-KRA rank for Pune Commercial Tower?",
  "Show safety compliance score and recent inspections.",
  "What critical risks were highlighted in the latest weekly report?",
  "What is the EVM schedule performance index (SPI) and cost variance?"
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome-1',
          sender: 'ASSISTANT',
          message_text: `👋 Hello ${currentUser?.full_name || 'Leader'}! I am your **Governed Construction AI Assistant**.\n\nEvery answer I provide is verified against authorized relational database records and approved engineering documents.\n\n*Note: In accordance with corporate governance, safety metrics in this platform are 100% human-audited; CCTV/camera feeds belong exclusively to Project SiteVision.*`,
          citations_json: [
            {
              type: 'GOVERNANCE_RULE',
              reference: 'RULE-01',
              label: 'Authoritative Grounding Protocol',
              details: 'Responses require direct database and document chunk citations.'
            }
          ],
          created_at: new Date().toISOString()
        }
      ]);
    }
  }, [currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      const response = await sendChatMessage(text, siteId, conversationId);
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

  const toggleCitations = (index: number) => {
    setExpandedCitations(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] pointer-events-auto" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10 pointer-events-auto">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200">
          
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-[#023B77] to-[#012d5a] text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-white/10 rounded-lg text-teal-300">
                <Bot className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  Construction AI Assistant
                  <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                </h3>
                <p className="text-[11px] text-blue-200">
                  Authoritative Grounding • Zero CCTV Scope
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold bg-white/10 text-white px-2 py-0.5 rounded">
                {siteId === 'ALL' ? 'Portfolio Scope' : siteId}
              </span>
              <button 
                onClick={onClose} 
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Prompts Carousel */}
          <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex gap-2 overflow-x-auto no-scrollbar">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(prompt)}
                disabled={loading}
                className="whitespace-nowrap px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-[#023B77] text-slate-700 hover:text-[#023B77] rounded-full text-[11px] font-medium transition-all shrink-0"
              >
                {prompt.length > 32 ? prompt.slice(0, 32) + '...' : prompt}
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
                    className={`max-w-[90%] p-3.5 rounded-xl shadow-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#023B77] text-white rounded-br-none'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
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
                          className="flex items-center justify-between w-full text-[11px] font-bold text-[#023B77] hover:underline"
                        >
                          <span className="flex items-center gap-1">
                            <LinkIcon className="w-3 h-3 text-[#039583]" />
                            {citations.length} Verified Source Citations
                          </span>
                          {expandedCitations[idx] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {expandedCitations[idx] && (
                          <div className="mt-2 space-y-1.5 font-mono text-[10px]">
                            {citations.map((c, ci) => (
                              <div key={ci} className="p-2 bg-slate-50 rounded border border-slate-200">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-[#023B77]">{c.label}</span>
                                  <span className="text-[9px] bg-teal-50 text-teal-800 px-1 rounded border border-teal-200">
                                    {c.type}
                                  </span>
                                </div>
                                <p className="text-slate-600 mt-0.5">{c.details}</p>
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
              <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-500 w-fit">
                <Sparkles className="w-4 h-4 text-[#039583] animate-spin" />
                Querying database records & engineering specs...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-3 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask about progress, 8-KRA, costs, or safety..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={loading}
                className="flex-1 p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#023B77] transition-all"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || loading}
                className="p-2.5 bg-[#023B77] hover:bg-[#012d5a] text-white rounded-lg transition-colors disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              Responses are strictly grounded in active records. Zero camera detections.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
