import React, { useState, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import {
  iCredentialsOpenAtom,
  iCredentialsMinimizedAtom,
} from '~/store/portalStack';
import { cn } from '~/utils';
import AgentDashboard from '../IAgent/Dashboard/AgentDashboard';
import { Toaster } from '../IAgent/Dashboard/ui/toaster';

export default function ICredentialsApp() {
  const [isOpen, setIsOpen] = useRecoilState(iCredentialsOpenAtom);
  const [isMinimized, setIsMinimized] = useRecoilState(iCredentialsMinimizedAtom);
  const [isMaximized, setIsMaximized] = useState(false);

  const toggleMaximize = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsMaximized(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsMaximized(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsMaximized(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'ease-[cubic-bezier(0.23_1_0.32_1)] i-credentials-theme dark fixed inset-0 z-[110] flex flex-col transition-all duration-700',
        isMinimized
          ? 'pointer-events-none translate-y-10 scale-95 opacity-0'
          : 'translate-y-0 scale-100 opacity-100',
      )}
    >
      <div className="relative flex h-full flex-col overflow-hidden border border-indigo-500/10 bg-[#020617] font-sans text-slate-100 shadow-[0_0_100px_rgba(99,102,241,0.05)] selection:bg-indigo-500/30">
        <div className="custom-scrollbar flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <AgentDashboard
            standalone
            onClose={() => setIsOpen(false)}
            onMinimize={() => setIsMinimized(true)}
            onToggleMaximize={toggleMaximize}
            isMaximized={isMaximized}
          />
        </div>

        <Toaster />

        <style
          dangerouslySetInnerHTML={{
            __html: `
                    .i-credentials-theme {
                        color-scheme: dark;
                        --background: 222 47% 5%;
                        --foreground: 210 40% 98%;
                        --card: 222 47% 11%;
                        --card-foreground: 210 40% 98%;
                        --popover: 222 47% 5%;
                        --popover-foreground: 210 40% 98%;
                        --primary: 243 75% 59%;
                        --primary-foreground: 210 40% 98%;
                        --secondary: 222 47% 15%;
                        --secondary-foreground: 210 40% 98%;
                        --muted: 222 47% 15%;
                        --muted-foreground: 215 20% 65%;
                        --accent: 222 47% 15%;
                        --accent-foreground: 210 40% 98%;
                        --destructive: 0 62.8% 30.6%;
                        --destructive-foreground: 210 40% 98%;
                        --border: 222 47% 15%;
                        --input: 222 47% 15%;
                        --ring: 243 75% 59%;
                        --radius: 1rem;
                    }

                    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255, 0.1); border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255, 0.2); }
                `,
          }}
        />
      </div>
    </div>
  );
}
