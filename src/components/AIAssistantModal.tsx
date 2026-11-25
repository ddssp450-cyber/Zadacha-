import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  X, 
  Bot, 
  User, 
  Check, 
  ArrowRight, 
  Clock, 
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { ChatMessage, UserProfile, Building, PaymentObligation, RepairTicket, CalendarEvent } from '../types';
import { getAuthHeaders } from '../lib/apiClient';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  building: Building;
  payments: PaymentObligation[];
  repairTickets: RepairTicket[];
  calendarEvents: CalendarEvent[];
  initialPrompt?: string;
  onNavigateTab: (tab: string, highlightItemId?: string) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  building,
  payments,
  repairTickets,
  calendarEvents,
  initialPrompt,
  onNavigateTab,
}) => {
  // History lives per user in this browser; App remounts the modal (key) when the user changes.
  const historyKey = `bb_chat_${currentUser.id}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey) || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return [
    {
      id: 'm-0',
      sender: 'assistant',
      text: `Здравейте, ${currentUser.name}! Аз съм вашият **Building Brain** асистент. 
Следя в реално време финансовите потоци, графика за поддръжка, авариите и комуникацията за „${building.name}“.

Можете да ме попитате за всякакви детайли по сградата или да ми възложите планиране на събития и ремонти.`,
      timestamp: 'току-що',
    },
  ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(messages));
    } catch {}
  }, [historyKey, messages]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      if (initialPrompt) {
        handleSendMessage(initialPrompt);
      }
    }
  }, [isOpen, initialPrompt]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const quickPrompts = [
    'Кой не е платил наема за този месец?',
    'Какво се случи днес в сградата?',
    'Колко сме похарчили за ремонти този месец?',
    'Обобщи проблемите на третия етаж.',
    'Планирай профилактика на асансьора за следващата седмица.',
    'Какви задачи имам за днес?',
    'Намери водопроводчик наблизо.',
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputValue;
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue('');
    setIsLoading(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          role: currentUser.role,
          conversationHistory: messages.slice(-4),
          contextData: {
            buildingName: building.name,
            buildingAddress: building.address,
            buildingCity: building.city,
            totalApartments: building.totalApartments,
            reserveFund: building.reserveFundBalance,
            paymentsSummary: {
              total: payments.length,
              pendingVerification: payments.filter((p) => p.status === 'pending_verification').map(p => ({ apt: p.apartmentNumber, amount: p.amount, tenant: p.tenantName })),
              overdue: payments.filter((p) => p.status === 'overdue').map(p => ({ apt: p.apartmentNumber, amount: p.amount, tenant: p.tenantName })),
            },
            repairsSummary: repairTickets.map((r) => ({
              ticket: r.ticketNumber,
              title: r.title,
              status: r.status,
              location: r.locationDetail,
              craftsman: r.assignedCraftsmanName,
              budget: r.approvedBudget || r.estimatedBudget,
            })),
            upcomingCalendar: calendarEvents.slice(0, 5).map((e) => ({
              title: e.title,
              date: e.startDateTime,
              assigned: e.assignedToName,
            })),
          },
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || 'Асистентът върна грешка.');
      }
      if (!res.body) throw new Error('Липсва отговор от сървъра.');

      // The reply streams in as plain text; the bubble appears with the first chunk and grows.
      const assistantId = `msg-${Date.now() + 1}`;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const text = reply;
        setMessages((prev) =>
          prev.some((m) => m.id === assistantId)
            ? prev.map((m) => (m.id === assistantId ? { ...m, text } : m))
            : [
                ...prev,
                {
                  id: assistantId,
                  sender: 'assistant',
                  text,
                  timestamp: new Date().toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }),
                },
              ]
        );
      }
      if (!reply) throw new Error('Асистентът не върна отговор.');
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error && err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'Асистентът не отговаря в момента. Данните ти са си тук — пробвай пак след малко.';
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          sender: 'assistant',
          text: msg,
          timestamp: 'сега',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/45">
      <div className="relative w-full max-w-3xl h-[88vh] max-h-[750px] rounded-2xl bg-sheet border border-line  flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-line flex items-center justify-between bg-raise">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-stamp-soft border border-stamp flex items-center justify-center text-stamp">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <span>Building Brain AI Асистент</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-stamp-soft text-stamp border border-stamp font-tech">
                  Активен модел: Gemini AI
                </span>
              </h3>
              <p className="text-[11px] text-ink">
                Захранен с пълните данни за сградата · Персонализиран за {currentUser.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink hover:text-ink hover:bg-sheet transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Prompts Bar */}
        <div className="px-4 py-2 border-b border-line bg-raise flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <span className="text-mute text-[11px] shrink-0 font-medium">
            Чести въпроси:
          </span>
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              className="px-2.5 py-1 rounded-md bg-sheet hover:bg-raise text-ink hover:text-mat border border-line whitespace-nowrap shrink-0 text-[11px] transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-stamp-soft border border-stamp flex items-center justify-center text-stamp shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl p-3.5 space-y-2 leading-relaxed ${
                    isUser
                      ? 'bg-mat text-white font-medium rounded-tr-sm shadow-md border border-mat/30'
                      : 'bg-sheet border border-line text-ink rounded-tl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {msg.text}
                  </div>

                  <div
                    className={`text-[10px] text-right font-tech ${
                      isUser ? 'text-mat' : 'text-mute'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>

                {isUser && (
                  <span className="w-7 h-7 rounded-full grid place-items-center bg-mat-soft font-tech text-[11px] text-mat shrink-0 mt-0.5 border border-line" aria-hidden>
                    {currentUser.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                )}
              </div>
            );
          })}

          {isLoading && messages[messages.length - 1]?.sender === 'user' && (
            <div className="flex items-center gap-3 text-xs text-ink">
              <div className="w-7 h-7 rounded-lg bg-stamp-soft border border-stamp flex items-center justify-center text-stamp shrink-0">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3 rounded-2xl bg-sheet border border-line rounded-tl-sm text-ink animate-pulse">
                Building Brain анализира данните за сградата и подготвя отговор...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-line bg-raise">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Попитайте за плащания, ремонти, графици или разходи..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-film border border-line rounded-xl text-xs text-ink placeholder-[#787163] focus:outline-none focus:border-mat"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="px-4 py-2.5 bg-mat hover:bg-mat-deep disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors border border-mat/40 shadow-sm"
            >
              <span>Изпрати</span>
              <Send className="w-3.5 h-3.5 text-stamp" />
            </button>
          </form>
          <div className="text-[10px] text-mute text-center mt-2">
            За важни действия като потвърждаване на плащания и одобрение на бюджети винаги се изисква вашето изрично потвърждение.
          </div>
        </div>
      </div>
    </div>
  );
};
