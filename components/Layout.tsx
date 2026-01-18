import React from 'react';

interface LayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

export const Layout: React.FC<LayoutProps> = ({ sidebar, children, isSidebarOpen, setIsSidebarOpen }) => {
  return (
    <div className="flex h-full w-full bg-transparent text-reson-text overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 md:hidden transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 frosted-glass border-r border-reson-border flex flex-col transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)
        md:relative md:translate-x-0 md:flex md:w-80 md:z-auto
        ${isSidebarOpen ? 'translate-x-0 shadow-2xl shadow-blue-900/40' : '-translate-x-full'}
      `}>
        {sidebar}
        
        {/* Navigation Control Chevron */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-1/2 -right-4 hidden md:flex w-8 h-8 frosted-glass rounded-full items-center justify-center shadow-lg text-reson-nav hover:text-white transition-all z-20 hover:scale-110 active:scale-90"
          title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          <svg className={`w-5 h-5 transition-transform duration-500 ${isSidebarOpen ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M15 19l-7-7 7-7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </aside>
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        {children}
      </main>
    </div>
  );
};