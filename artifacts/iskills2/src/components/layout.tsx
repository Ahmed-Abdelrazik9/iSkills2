import * as React from "react"
import { Link } from "wouter"
import { PenTool, Library } from "lucide-react"

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-card p-6 flex flex-col gap-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-gold flex items-center justify-center shrink-0">
            <PenTool className="h-4 w-4 text-white" />
          </div>
          <span className="font-serif text-2xl tracking-tight text-foreground">iSkills2</span>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          <p className="text-xs uppercase tracking-widest font-black text-accent mb-2">Menu</p>
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-accent/10 transition-colors text-foreground font-medium">
            <Library className="h-4 w-4 text-muted-foreground" />
            Skills Library
          </Link>
        </nav>

        <div className="mt-auto" />
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  )
}
