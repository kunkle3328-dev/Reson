import React, { useState } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <div className="frosted-glass rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300 border border-blue-500/20">
        <div className="px-8 py-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="w-2 h-2 bg-reson-nav rounded-full animate-pulse shadow-blue-500 shadow-lg"></span>
            {title}
          </h3>
          <button onClick={onClose} className="text-reson-muted hover:text-white transition-all hover:rotate-90">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
};

export const AddNotebookModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}> = ({ isOpen, onClose, onAdd }) => {
  const [name, setName] = useState('');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Initialize Project">
      <div className="space-y-8">
        <div>
          <label className="block text-[11px] font-bold text-reson-muted uppercase tracking-[0.2em] mb-3">Project Designation</label>
          <input
            type="text"
            className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-reson-nav/50 text-white placeholder:text-reson-muted/30 transition-all text-lg font-medium"
            placeholder="e.g., QUANTUM RESEARCH LAB"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <button
          onClick={() => {
            if (name.trim()) {
              onAdd(name.trim());
              setName('');
            }
          }}
          disabled={!name.trim()}
          className="w-full py-4 bg-reson-nav text-white rounded-2xl font-extrabold text-sm uppercase tracking-widest hover:brightness-125 disabled:opacity-20 transition-all active:scale-[0.98] shadow-xl shadow-blue-900/40"
        >
          Begin Project
        </button>
      </div>
    </Modal>
  );
};

export const AddSourceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onAdd: (source: { type: 'text' | 'url' | 'file', title: string, content: string, url?: string }) => void;
}> = ({ isOpen, onClose, onAdd }) => {
  const [tab, setTab] = useState<'upload' | 'url' | 'paste'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [url, setUrl] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      onAdd({ type: 'file', title: file.name, content });
      setLoading(false);
      onClose();
    };
    reader.readAsText(file);
  };

  const handleUrlSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      const doc = new DOMParser().parseFromString(data.contents, 'text/html');
      const title = doc.querySelector('title')?.textContent || url;
      const content = (doc.body.textContent || "").replace(/\s+/g, ' ').trim();

      onAdd({ type: 'url', title, content, url });
      setUrl('');
      onClose();
    } catch (err) {
      setError("Neural link failed. Manually paste source content.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Source Ingestion">
      <div className="flex bg-white/5 p-1.5 rounded-[20px] mb-8 border border-white/5">
        {(['upload', 'url', 'paste'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl transition-all ${
              tab === t ? 'bg-reson-nav text-white shadow-lg' : 'text-reson-muted hover:text-white'
            }`}
          >
            {t === 'upload' ? 'Datastream' : t === 'url' ? 'Neural Link' : 'Raw Content'}
          </button>
        ))}
      </div>

      <div className="min-h-[200px]">
        {tab === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-white/10 rounded-3xl p-12 text-center hover:border-reson-nav/50 hover:bg-white/5 transition-all cursor-pointer relative group">
              <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload}
              />
              <div className="space-y-5">
                <div className="w-16 h-16 bg-reson-nav/10 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-reson-nav" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-bold text-lg">Transmit File</p>
                  <p className="text-[10px] text-reson-muted font-bold uppercase tracking-[0.2em] mt-2">PDF, TXT, or Markdown Supported</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'url' && (
          <div className="space-y-6">
            <div>
              <label className="block text-[11px] font-bold text-reson-muted uppercase tracking-[0.2em] mb-3">Target Coordinate (URL)</label>
              <input
                type="url"
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-reson-nav text-white placeholder:text-reson-muted/20"
                placeholder="https://intelligence.portal/report"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            {error && <p className="text-[10px] text-reson-warn font-black uppercase tracking-widest">{error}</p>}
            <button
              onClick={handleUrlSubmit}
              disabled={loading || !url.trim()}
              className="w-full py-4 bg-reson-nav text-white rounded-2xl font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-30 transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Synthesizing...
                </>
              ) : 'Establish Link'}
            </button>
          </div>
        )}

        {tab === 'paste' && (
          <div className="space-y-6">
            <div>
              <label className="block text-[11px] font-bold text-reson-muted uppercase tracking-[0.2em] mb-3">Label Identifier</label>
              <input
                type="text"
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none text-white text-base"
                placeholder="Source Identifier"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-reson-muted uppercase tracking-[0.2em] mb-3">Data Matrix (Content)</label>
              <textarea
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none text-white min-h-[160px] resize-none text-sm"
                placeholder="Initialize datastream..."
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
              />
            </div>
            <button
              onClick={() => {
                if (pasteTitle.trim() && pasteContent.trim()) {
                  onAdd({ type: 'text', title: pasteTitle.trim(), content: pasteContent.trim() });
                  setPasteTitle('');
                  setPasteContent('');
                  onClose();
                }
              }}
              disabled={!pasteTitle.trim() || !pasteContent.trim()}
              className="w-full py-4 bg-reson-nav text-white rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all"
            >
              Commit Data
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};