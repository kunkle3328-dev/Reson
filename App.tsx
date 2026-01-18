import React, { useState, useEffect, useMemo, useRef, useCallback, useReducer } from 'react';
import { Layout } from './components/Layout';
import { AddNotebookModal, AddSourceModal, Modal } from './components/Modals';
import { AppState, Notebook, Source, ChatMessage, Reflection, DiscoveryResult, Hypothesis, TimelineEvent, IntelligenceState, IntelligenceAction, IntelligencePhase, AudioOverview, AudioSegment } from './types';
import { storageService } from './services/storageService';
import { geminiService } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const initialIntelligenceState: IntelligenceState = {
  phase: "idle",
  intensity: 0,
  confidence: 0,
  interruptible: true,
  transcript: "",
  partialTranscript: "",
  synthesisProgress: 0,
  lastUtteranceTs: 0,
};

function intelligenceReducer(state: IntelligenceState, action: IntelligenceAction): IntelligenceState {
  switch (action.type) {
    case "SIGNAL_PHASE": return { ...state, phase: action.payload };
    case "SIGNAL_INTENSITY": return { ...state, intensity: action.payload };
    case "SIGNAL_CONFIDENCE": return { ...state, confidence: action.payload };
    case "SIGNAL_TRANSCRIPT": return action.partial ? { ...state, partialTranscript: action.payload } : { ...state, transcript: action.payload, partialTranscript: "" };
    case "SIGNAL_PROGRESS": return { ...state, synthesisProgress: action.payload };
    case "SIGNAL_INTERRUPT": return { ...state, phase: "explaining", intensity: 0, partialTranscript: "" };
    case "SIGNAL_RESET": return initialIntelligenceState;
    default: return state;
  }
}

const ResonMark: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const s = size === 'sm' ? 'w-5 h-5 rounded-md text-[8px]' : 'w-8 h-8 rounded-lg text-xs';
  return (
    <div className={`${s} bg-blue-600 flex items-center justify-center font-black text-white shadow-lg`}>
      R
    </div>
  );
};

// Contextual Voice Orb - used inside specific views (Chat Input / Audio Panel)
const ContextualVoiceOrb: React.FC<{ phase: IntelligencePhase; intensity: number; onClick: () => void; size?: 'sm' | 'md' }> = ({ phase, intensity, onClick, size = 'md' }) => {
  const scale = 1 + (intensity || 0) * 0.25;
  const s = size === 'sm' ? 'w-10 h-10' : 'w-14 h-14';
  
  return (
    <button 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`relative flex items-center justify-center ${s} transition-all active:scale-90 flex-shrink-0 z-50`}
    >
      <div 
        className="orb-core" 
        data-phase={phase}
        style={{ transform: `scale(${scale})` }}
      />
      <svg className="absolute w-4 h-4 text-white z-20 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
      </svg>
    </button>
  );
};

const SynthesisField: React.FC<{ phase: IntelligencePhase; intensity: number }> = ({ phase, intensity }) => {
  if (!["synthesizing", "thinking", "reflecting", "generating-audio", "speaking", "explaining"].includes(phase)) return null;
  return (
    <div className="absolute inset-0 pointer-events-none transition-opacity duration-1000 z-0" style={{ background: `radial-gradient(circle at 50% 50%, rgba(59, 130, 246, ${0.1 * (intensity || 0)}), rgba(5, 9, 20, 0.98))` }}>
      {(phase === "synthesizing" || phase === "generating-audio") && <div className="light-flow" />}
    </div>
  );
};

const EmptyState: React.FC<{ title: string; message: string; cta?: string; onCta?: () => void; isRunning?: boolean }> = ({ title, message, cta, onCta, isRunning }) => (
  <div className="flex flex-col items-center justify-center pt-24 pb-12 px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
    <div className="w-16 h-16 rounded-full border border-dashed border-white/10 flex items-center justify-center mb-6 text-slate-500">
      <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    </div>
    <h3 className="text-md font-black text-white uppercase italic tracking-widest">{title}</h3>
    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2 max-w-[240px] leading-relaxed">{message}</p>
    {cta && onCta && (
      <button 
        onClick={onCta} 
        disabled={isRunning}
        className="mt-8 px-10 py-3 bg-blue-600 text-white text-[9px] font-black uppercase tracking-[0.2em] rounded-full shadow-2xl active:scale-95 transition-all disabled:opacity-50"
      >
        {isRunning ? "Running Synthesis..." : cta}
      </button>
    )}
  </div>
);

const SynthesisActionBar: React.FC<{
  sourcesCount: number;
  isSynthesizing: boolean;
  hasResult: boolean;
  onSynthesize: () => void;
}> = ({ sourcesCount, isSynthesizing, hasResult, onSynthesize }) => {
  const disabled = sourcesCount === 0 || isSynthesizing;

  return (
    <div className="sticky top-0 z-30 backdrop-blur-3xl bg-black/40 border-b border-white/5 px-4 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 overflow-hidden">
        <div className={`w-1.5 h-1.5 rounded-full ${sourcesCount > 0 ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-slate-700'}`} />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">
          ● {sourcesCount} Sources Indexed
        </span>
      </div>

      <button
        disabled={disabled}
        onClick={onSynthesize}
        className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 
          ${disabled 
            ? 'bg-white/10 text-white/40 cursor-not-allowed' 
            : 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:brightness-110'
          }`}
      >
        {isSynthesizing ? "Synthesizing…" : hasResult ? "Regenerate" : "Synthesize Knowledge"}
      </button>
    </div>
  );
};

const MarkdownRenderer: React.FC<{ content: any }> = ({ content }) => (
  <article className="prose prose-invert max-w-none text-slate-300 leading-relaxed text-[14.5px] md:text-base">
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({node, ...props}) => <h1 className="text-[20px] md:text-3xl font-black text-white italic uppercase tracking-tight mb-4 border-b border-white/10 pb-2" {...props} />,
        h2: ({node, ...props}) => <h2 className="text-[18px] md:text-2xl font-black text-white italic uppercase tracking-tight mt-6 mb-3" {...props} />,
        p: ({node, ...props}) => <p className="mb-4" {...props} />,
      }}
    >
      {String(content || '')}
    </ReactMarkdown>
  </article>
);

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => storageService.loadState());
  const [intelState, dispatchIntel] = useReducer(intelligenceReducer, initialIntelligenceState);
  
  const [isNotebookModalOpen, setIsNotebookModalOpen] = useState(false);
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);
  const [discoveryTopic, setDiscoveryTopic] = useState('');
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveryResult[]>([]);
  const [discoverySelected, setDiscoverySelected] = useState<Set<number>>(new Set());
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [view, setView] = useState<'chat' | 'audio' | 'explore' | 'reflections' | 'hypotheses' | 'timeline' | 'sources'>('chat');
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { storageService.saveState(state); }, [state]);
  useEffect(() => { if (chatContainerRef.current) chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' }); }, [state.messages, isChatLoading, view]);

  const activeNotebook = useMemo(() => state.notebooks.find(n => n.id === state.activeNotebookId) || null, [state.notebooks, state.activeNotebookId]);
  const activeSources = useMemo(() => state.sources.filter(s => s.notebookId === state.activeNotebookId), [state.sources, state.activeNotebookId]);
  const activeMessages = useMemo(() => (state.activeNotebookId ? state.messages[state.activeNotebookId] : []) || [], [state.messages, state.activeNotebookId]);
  const currentViewSource = useMemo(() => state.sources.find(s => s.id === selectedSourceId) || null, [state.sources, selectedSourceId]);

  const handleAddNotebook = (name: string) => {
    const newNotebook: Notebook = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      reflections: [],
      hypotheses: [],
      timeline: []
    };
    setState(prev => ({
      ...prev,
      notebooks: [...prev.notebooks, newNotebook],
      activeNotebookId: newNotebook.id
    }));
    setIsNotebookModalOpen(false);
  };

  const handleGenerateOverview = async () => {
    if (!activeNotebook || activeSources.length === 0) return;
    dispatchIntel({ type: "SIGNAL_PHASE", payload: "synthesizing" });
    dispatchIntel({ type: "SIGNAL_INTENSITY", payload: 0.6 });
    try {
      const res = await geminiService.runFullSynthesis(activeSources);
      const briefingId = crypto.randomUUID();
      const derivedSource: Source = { id: briefingId, type: 'derived', title: `Intelligence Briefing — ${new Date().toLocaleDateString()}`, content: res.briefing, notebookId: activeNotebook.id, createdAt: Date.now(), isDerived: true };
      const notebookUpdate: Partial<Notebook> = {
        reflections: res.reflections.map(r => ({ ...r, id: crypto.randomUUID(), timestamp: Date.now() })),
        hypotheses: res.hypotheses.map(h => ({ ...h, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() })),
        timeline: res.timeline.map(t => ({ ...t, id: crypto.randomUUID() })),
        audioOverview: res.audioOverview
      };
      setState(prev => ({ ...prev, sources: [...prev.sources, derivedSource], notebooks: prev.notebooks.map(nb => nb.id === activeNotebook.id ? { ...nb, ...notebookUpdate } : nb) }));
      setSelectedSourceId(briefingId);
    } catch (e) {
      console.error("Synthesis Failed", e);
    } finally { dispatchIntel({ type: "SIGNAL_RESET" }); }
  };

  const toggleLiveVoice = async () => {
    if (intelState.phase !== 'idle' && intelState.phase !== 'error') {
      dispatchIntel({ type: "SIGNAL_RESET" });
      await geminiService.stopLive();
      return;
    }
    
    dispatchIntel({ type: "SIGNAL_PHASE", payload: "listening" });
    try {
      await geminiService.connectLive(activeSources, (msg) => {
        if (msg.serverContent?.modelTurn) {
          dispatchIntel({ type: "SIGNAL_PHASE", payload: "explaining" });
          dispatchIntel({ type: "SIGNAL_INTENSITY", payload: 0.8 });
        }
        if (msg.serverContent?.turnComplete) {
          dispatchIntel({ type: "SIGNAL_PHASE", payload: "reflecting" });
          dispatchIntel({ type: "SIGNAL_INTENSITY", payload: 0.2 });
          setTimeout(() => dispatchIntel({ type: "SIGNAL_RESET" }), 2000);
        }
      });
    } catch (err) { dispatchIntel({ type: "SIGNAL_RESET" }); }
  };

  const playAudioOverview = async () => {
    if (!activeNotebook?.audioOverview) return;
    dispatchIntel({ type: "SIGNAL_PHASE", payload: "generating-audio" });
    dispatchIntel({ type: "SIGNAL_INTENSITY", payload: 0.4 });
    try {
      await geminiService.speakMultiVoiceSegments(activeNotebook.audioOverview.segments);
      dispatchIntel({ type: "SIGNAL_PHASE", payload: "speaking" });
      dispatchIntel({ type: "SIGNAL_INTENSITY", payload: 0.7 });
    } catch(err) { 
      console.error("Audio playback error", err);
      dispatchIntel({ type: "SIGNAL_RESET" }); 
    }
  };

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || !state.activeNotebookId || isChatLoading) return;
    const nbId = state.activeNotebookId;
    const msg = chatInput;
    setChatInput('');
    setIsChatLoading(true);
    dispatchIntel({ type: "SIGNAL_PHASE", payload: "thinking" });
    setState(prev => ({ ...prev, messages: { ...prev.messages, [nbId]: [...(prev.messages[nbId] || []), { id: crypto.randomUUID(), role: 'user', text: msg, timestamp: Date.now() }] } }));
    try {
      const res = await geminiService.groundedChat(msg, activeSources);
      setState(prev => ({ ...prev, messages: { ...prev.messages, [nbId]: [...(prev.messages[nbId] || []), { id: crypto.randomUUID(), role: 'model', text: res.text, timestamp: Date.now() }] } }));
    } finally { setIsChatLoading(false); dispatchIntel({ type: "SIGNAL_RESET" }); }
  }, [chatInput, state.activeNotebookId, isChatLoading, activeSources]);

  const handleDiscoverSources = async () => {
    if (!discoveryTopic.trim()) return;
    setIsDiscoveryLoading(true);
    try { const res = await geminiService.discoverSources(discoveryTopic); setDiscoveryResults(res); } finally { setIsDiscoveryLoading(false); }
  };

  const handleImportDiscovery = () => {
    if (!activeNotebook) return;
    const selected = discoveryResults.filter((_, idx) => discoverySelected.has(idx)).map(r => ({ id: crypto.randomUUID(), type: 'url' as const, title: r.title, content: r.snippet + "\n\n" + r.relevance, url: r.url, notebookId: activeNotebook.id, createdAt: Date.now() }));
    setState(prev => ({ ...prev, sources: [...prev.sources, ...selected] }));
    setIsDiscoveryModalOpen(false);
    setDiscoveryResults([]);
  };

  const hasSynthesisResult = !!(activeNotebook?.audioOverview || (activeNotebook?.reflections && activeNotebook.reflections.length > 0));

  return (
    <Layout isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} sidebar={
      <div className="flex flex-col h-full bg-[#070B14]">
        <div className="p-4 md:p-6 border-b border-white/5 flex items-center gap-2">
          <ResonMark size="sm" />
          <h1 className="text-sm font-black uppercase tracking-widest text-white italic">Vaults</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
          {state.notebooks.map(nb => (
            <div key={nb.id} onClick={() => { setState(prev => ({ ...prev, activeNotebookId: nb.id })); setSelectedSourceId(null); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
              className={`px-4 py-2 rounded-xl cursor-pointer text-[11px] font-bold transition-all border ${state.activeNotebookId === nb.id ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 shadow-inner' : 'text-slate-500 border-transparent hover:bg-white/5'}`}>{nb.name}</div>
          ))}
        </div>
        <div className="p-4 bg-black/40 border-t border-white/5">
          <button onClick={() => setIsNotebookModalOpen(true)} className="w-full py-2.5 bg-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 shadow-lg shadow-blue-900/20">+ Initialize</button>
        </div>
      </div>
    }>
      
      <div className="md:hidden sticky top-0 z-40 px-2 py-1 flex items-center bg-[#070B14]/90 backdrop-blur-2xl border-b border-white/5">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-blue-500 active:scale-90 text-xl">☰</button>
        <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar py-1">
          {(['sources', 'chat', 'audio', 'explore', 'reflections', 'hypotheses', 'timeline'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all whitespace-nowrap ${view === v ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>{v === 'audio' ? '🎧 Audio' : v}</button>
          ))}
        </div>
      </div>

      {!activeNotebook ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full bg-[#050914] voice-stage">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-3xl font-black shadow-2xl mb-8 animate-breathe">R</div>
          <h2 className="text-xl md:text-3xl font-black text-white uppercase italic mb-8 tracking-tighter">Knowledge Awaits.</h2>
          <button onClick={() => setIsNotebookModalOpen(true)} className="px-8 py-3 bg-blue-600 rounded-[24px] text-[9px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95">Initialize Project</button>
        </div>
      ) : (
        <div className="flex flex-1 h-full flex-col md:flex-row relative overflow-hidden">
          <SynthesisField phase={intelState.phase} intensity={intelState.intensity} />

          <section className={`${view === 'sources' ? 'flex' : 'hidden md:flex'} w-full md:w-64 border-r border-white/5 flex flex-col h-full bg-[#070B14]/30 z-10`}>
            <div className="p-3 border-b border-white/5 flex justify-between items-center bg-black/20">
               <h2 className="text-[9px] font-black uppercase tracking-widest text-slate-600">Library</h2>
               <div className="flex gap-1">
                 <button onClick={() => setIsDiscoveryModalOpen(true)} className="p-1.5 rounded-lg bg-blue-600/10 text-blue-500 active:scale-90"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2.5"/></svg></button>
                 <button onClick={() => setIsSourceModalOpen(true)} className="p-1.5 rounded-lg bg-blue-600/10 text-blue-500 active:scale-90"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v16m8-8H4" strokeWidth="3"/></svg></button>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
              {activeSources.map(s => (
                <div key={s.id} onClick={() => { setSelectedSourceId(s.id); setView('explore'); }} className={`p-3 glass-panel cursor-pointer transition-all rounded-xl border ${selectedSourceId === s.id ? 'border-blue-500/40 bg-blue-600/5' : 'border-white/5 opacity-70 hover:opacity-100'}`}>
                  <h4 className="text-[8px] font-black text-white uppercase truncate mb-0.5 italic">{s.title}</h4>
                  <p className="text-[8px] text-slate-500 line-clamp-1 leading-relaxed">{s.content}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex-1 flex flex-col relative h-full overflow-hidden z-20">
            <header className="hidden md:flex px-6 py-4 border-b border-white/5 items-center justify-between bg-black/30">
              <div className="flex items-center gap-3">
                <ResonMark size="sm" />
                <h2 className="text-[10px] font-black text-white uppercase italic truncate max-w-[150px]">{activeNotebook.name}</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
                  {(['sources', 'chat', 'audio', 'explore', 'reflections', 'hypotheses', 'timeline'] as const).map(v => (
                    <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-[8.5px] font-black uppercase tracking-tight transition-all ${view === v ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-white'}`}>{v === 'audio' ? '🎧 Audio' : v}</button>
                  ))}
                </div>
              </div>
            </header>

            {view !== 'chat' && view !== 'sources' && (
              <SynthesisActionBar 
                sourcesCount={activeSources.length} 
                isSynthesizing={intelState.phase === 'synthesizing'}
                hasResult={hasSynthesisResult}
                onSynthesize={handleGenerateOverview}
              />
            )}

            <div className="flex-1 flex flex-col h-full overflow-hidden relative items-center justify-center">
               
               {view === 'chat' && (
                 <div className="w-full flex flex-col h-full max-w-2xl px-4 relative">
                   <div ref={chatContainerRef} className="flex-1 overflow-y-auto py-6 space-y-6 no-scrollbar pb-40 pt-4">
                     {activeMessages.length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center text-center">
                         <h3 className="text-md font-black text-white uppercase italic opacity-60">Analyst console</h3>
                         <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.4em] opacity-30 mt-2">Awaiting inquiry.</p>
                       </div>
                     ) : activeMessages.map(m => (
                       <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                         <div className={`max-w-[90%] md:max-w-[85%] px-4 py-3 rounded-2xl text-[14.5px] leading-relaxed border ${m.role === 'user' ? 'btn-premium text-white border-white/10 shadow-lg' : 'glass-panel text-slate-300'}`}>
                           <MarkdownRenderer content={m.text} />
                         </div>
                       </div>
                     ))}
                     {isChatLoading && <div className="flex gap-1.5 p-2 bg-white/5 rounded-full w-20 justify-center animate-pulse mx-auto"><div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div><div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]"></div></div>}
                   </div>
                   
                   <div className="sticky bottom-0 w-full py-4 bg-transparent pb-safe-bottom">
                     <div className="flex items-center gap-2 bg-[#070B14]/80 border border-white/10 rounded-2xl px-2 py-2 shadow-xl backdrop-blur-3xl animate-in slide-in-from-bottom-2">
                       <ContextualVoiceOrb phase={intelState.phase} intensity={intelState.intensity} onClick={toggleLiveVoice} size="sm" />
                       <textarea 
                        value={chatInput} 
                        onChange={e => setChatInput(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())} 
                        rows={1} 
                        placeholder="Neural Inquiry..." 
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white placeholder:text-slate-700 resize-none min-h-[36px] flex items-center pt-2" 
                      />
                       <button onClick={handleSendMessage} disabled={!chatInput.trim() || isChatLoading} className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white active:scale-90 shadow-lg"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg></button>
                     </div>
                   </div>
                 </div>
               )}

               <div className={`w-full h-full overflow-y-auto no-scrollbar scroll-smooth ${view === 'chat' ? 'hidden' : 'block'}`}>
                  <div className="max-w-3xl mx-auto px-4 py-6 pb-40">
                    
                    {view === 'audio' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 text-center">
                        <h3 className="text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter">Audio Intelligence Briefing</h3>
                        {!activeNotebook.audioOverview ? (
                          <EmptyState 
                            title="No Synthesis Yet" 
                            message="Create a comprehensive audio narrative from your research units." 
                            cta="Synthesize Audio Briefing"
                            onCta={handleGenerateOverview}
                            isRunning={intelState.phase === 'synthesizing'}
                          />
                        ) : (
                          <div className="glass-panel p-8 rounded-[24px] space-y-8 border-blue-500/10 shadow-2xl max-w-sm mx-auto relative overflow-hidden">
                             <div className="flex flex-col items-center">
                               <div className="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mb-4 text-blue-500">
                                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" strokeWidth="2.5"/></svg>
                               </div>
                               <h4 className="text-md font-black text-white uppercase tracking-tight italic">Multi-Voice Synthesis</h4>
                               <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Podcast Narrative Ready</p>
                             </div>
                             
                             <div className="space-y-4">
                               <button onClick={playAudioOverview} disabled={intelState.phase !== 'idle'} className="w-full py-4 bg-blue-600 text-white rounded-[20px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 text-[10px]">
                                 {intelState.phase !== 'idle' && intelState.phase !== 'error' ? "Audio Active..." : "Stream Briefing"}
                               </button>
                               <div className="flex flex-col items-center gap-2 pt-2">
                                 <ContextualVoiceOrb phase={intelState.phase} intensity={intelState.intensity} onClick={toggleLiveVoice} size="md" />
                                 <span className="text-[10px] font-black text-slate-500 uppercase italic tracking-widest">Ask follow-up questions</span>
                               </div>
                             </div>

                             <div className="space-y-3 text-left pt-5 border-t border-white/5">
                               {activeNotebook.audioOverview.chapters.map(c => (
                                 <div key={c.id} className="flex gap-3">
                                   <div className="w-0.5 h-6 bg-blue-600/20 rounded-full" />
                                   <div>
                                     <div className="text-[9px] font-black text-white uppercase italic">{c.title}</div>
                                     <div className="text-[8px] text-slate-500 uppercase font-bold truncate max-w-[200px]">{c.summary}</div>
                                   </div>
                                 </div>
                               ))}
                             </div>
                          </div>
                        )}
                      </div>
                    )}

                    {view === 'explore' && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                         {currentViewSource ? (
                           <article className="glass-panel p-5 md:p-10 border-blue-500/10 shadow-xl rounded-2xl relative overflow-hidden">
                              <MarkdownRenderer content={currentViewSource.content} />
                           </article>
                         ) : (
                           <EmptyState 
                             title="Ready to Synthesize" 
                             message="Synthesize a detailed intelligence report from your research." 
                             cta="Synthesize Report"
                             onCta={handleGenerateOverview}
                             isRunning={intelState.phase === 'synthesizing'}
                           />
                         )}
                      </div>
                    )}

                    {view === 'reflections' && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter text-center">Neural Reflections</h3>
                        {!activeNotebook.reflections?.length ? (
                          <EmptyState 
                            title="No Reflections" 
                            message="Deeper insights emerge after synthesis." 
                            cta="Run Synthesis"
                            onCta={handleGenerateOverview}
                            isRunning={intelState.phase === 'synthesizing'}
                          />
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeNotebook.reflections.map(ref => (
                              <div key={ref.id} className="glass-panel p-5 group relative overflow-hidden transition-all hover:border-blue-500/30 rounded-xl shadow-lg border-white/5">
                                <h4 className="text-[11px] font-black text-white uppercase mb-2 italic tracking-tight">{ref.title}</h4>
                                <p className="text-[11px] text-slate-400 leading-relaxed font-medium">{ref.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {view === 'hypotheses' && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter text-center">Hypotheses</h3>
                        {!activeNotebook.hypotheses?.length ? (
                          <EmptyState 
                            title="No Hypotheses" 
                            message="Evolving predictions are mapped during synthesis." 
                            cta="Identify Hypotheses"
                            onCta={handleGenerateOverview}
                            isRunning={intelState.phase === 'synthesizing'}
                          />
                        ) : (
                          <div className="space-y-4">
                            {activeNotebook.hypotheses.map(hyp => (
                              <div key={hyp.id} className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-2 border-blue-600 shadow-md rounded-xl border-white/5">
                                <p className="text-[14.5px] font-bold text-white italic tracking-tight leading-snug">"{hyp.statement}"</p>
                                <div className="flex gap-4 items-center flex-shrink-0">
                                  <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${hyp.status === 'confirmed' ? 'bg-green-500/20 text-green-400' : 'bg-blue-600/10 text-blue-500'}`}>{hyp.status}</span>
                                  <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{Math.round(hyp.confidence * 100)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {view === 'timeline' && (
                      <div className="py-6 space-y-12 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter text-center">Evolution Map</h3>
                        {!activeNotebook.timeline?.length ? (
                          <EmptyState 
                            title="No Timeline" 
                            message="Chronological maps are built during synthesis." 
                            cta="Build Timeline"
                            onCta={handleGenerateOverview}
                            isRunning={intelState.phase === 'synthesizing'}
                          />
                        ) : (
                          <div className="relative pl-10 md:pl-16 border-l border-white/5 ml-4 md:ml-8 space-y-10">
                            {activeNotebook.timeline.map((ev, i) => (
                              <div key={ev.id} className="relative animate-in slide-in-from-left-4" style={{ animationDelay: `${i * 100}ms` }}>
                                <div className="absolute -left-[57px] md:-left-[73px] top-0 w-8 h-8 rounded-lg bg-[#050914] border border-blue-600 flex items-center justify-center shadow-md z-10"><ResonMark size="sm" /></div>
                                <div className="glass-panel p-5 space-y-3 group rounded-xl shadow-md border-white/5">
                                  <div className="text-[8px] md:text-[9px] font-black text-blue-500 uppercase tracking-widest italic">{ev.dateString} — {ev.label}</div>
                                  <p className="text-sm md:text-xl font-bold text-white italic opacity-95 group-hover:text-blue-400 transition-colors leading-relaxed tracking-tight">"{ev.summary}"</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
               </div>
            </div>
          </section>
        </div>
      )}

      <Modal isOpen={isDiscoveryModalOpen} onClose={() => { setIsDiscoveryModalOpen(false); setDiscoveryResults([]); setDiscoveryTopic(''); }} title="Neural Discovery">
        <div className="space-y-6">
          <div className="relative">
            <input type="text" value={discoveryTopic} onChange={(e) => setDiscoveryTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleDiscoverSources()} placeholder="Target Domain..." className="w-full px-5 py-3 md:px-8 md:py-6 bg-white/5 border border-white/10 rounded-xl focus:ring-4 focus:ring-blue-600/30 text-white text-md md:text-xl font-bold pr-20 shadow-inner" />
            <button onClick={handleDiscoverSources} className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-lg active:scale-90"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg></button>
          </div>
          {isDiscoveryLoading && <div className="py-10 text-center animate-pulse"><p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.5em]">Establishing uplink...</p></div>}
          {discoveryResults.length > 0 && (
            <div className="space-y-3 max-h-[35vh] overflow-y-auto no-scrollbar">
               {discoveryResults.map((res, idx) => (
                 <div key={idx} className={`p-4 glass-panel border transition-all cursor-pointer group rounded-xl ${discoverySelected.has(idx) ? 'border-blue-600 bg-blue-600/10' : 'border-white/5'}`} onClick={() => { const n = new Set(discoverySelected); if (n.has(idx)) n.delete(idx); else n.add(idx); setDiscoverySelected(n); }}>
                   <div className="flex items-start gap-3">
                      <div className={`mt-1 w-5 h-5 rounded-md border-2 ${discoverySelected.has(idx) ? 'bg-blue-600 border-blue-600' : 'border-white/20'}`} />
                      <div className="min-w-0"><h4 className="text-xs font-black text-white truncate uppercase italic mb-1">{res.title}</h4><p className="text-[9px] text-slate-500 font-bold italic truncate">"{res.relevance}"</p></div>
                   </div>
                 </div>
               ))}
               <button onClick={handleImportDiscovery} disabled={!discoverySelected.size} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-[0.2em] italic shadow-lg">Ingest {discoverySelected.size} Units</button>
            </div>
          )}
        </div>
      </Modal>

      <AddNotebookModal isOpen={isNotebookModalOpen} onClose={() => setIsNotebookModalOpen(false)} onAdd={handleAddNotebook} />
      <AddSourceModal isOpen={isSourceModalOpen} onClose={() => setIsSourceModalOpen(false)} onAdd={(s) => {
        if (state.activeNotebookId) {
          const ns = { ...s, id: crypto.randomUUID(), notebookId: state.activeNotebookId, createdAt: Date.now() };
          setState(prev => ({ ...prev, sources: [...prev.sources, ns] }));
        }
        setIsSourceModalOpen(false);
      }} />
    </div>
  );
};

export default App;