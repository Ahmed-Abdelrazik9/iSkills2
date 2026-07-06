import * as React from "react"
import { Link, useLocation } from "wouter"
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react"
import { removeToken } from "@/lib/auth"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "./ui/button"
import { PenTool, Library, Settings, LogOut, Loader2 } from "lucide-react"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } })
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!isLoading && (isError || !user)) {
      setLocation("/login")
    }
  }, [isLoading, isError, user, setLocation])

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const handleLogout = () => {
    removeToken()
    queryClient.clear()
    setLocation("/login")
  }

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

        <div className="mt-auto">
          <div className="p-4 rounded-xl border border-border bg-background/50 mb-4">
            <p className="text-sm font-medium truncate">{user.email}</p>
            <p className="text-xs text-muted-foreground">Pro Member</p>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  )
}
