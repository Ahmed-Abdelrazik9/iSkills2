import React, { useRef } from "react"
import { useListSkills, useGetStats, useCreateSkill, getListSkillsQueryKey } from "@workspace/api-client-react"
import { Link, useLocation } from "wouter"
import { AppLayout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Plus, Search, Activity, BookOpen, Clock, Zap, Upload, Globe } from "lucide-react"
import { format } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""

export default function Dashboard() {
  const { data: skills, isLoading: skillsLoading } = useListSkills({ query: { queryKey: getListSkillsQueryKey() } })
  const { data: stats, isLoading: statsLoading } = useGetStats()
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [importOpen, setImportOpen] = React.useState(false)
  const [importContent, setImportContent] = React.useState("")
  const [importIsearch, setImportIsearch] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const detectIsearch = React.useCallback((text: string) => {
    const searchTerms = [
      "web search", "search the web", "search online", "look up online", "search internet",
      "current information", "latest information", "up-to-date", "recent data", "latest news",
      "live data", "real-time", "fetch from web", "browse the web", "internet search",
      "online search", "find online", "google", "duckduckgo", "web lookup", "web query",
    ]
    const lower = text.toLowerCase()
    return searchTerms.some((t) => lower.includes(t))
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setImportContent(text)
      setImportIsearch(detectIsearch(text))
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!importContent.trim()) {
      toast({ title: "Paste or upload a SKILL.md file first", variant: "destructive" })
      return
    }
    setImporting(true)
    try {
      const res = await fetch(`${BASE}/api/iskills2/skills/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: importContent, isearch: importIsearch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Import failed")
      queryClient.invalidateQueries({ queryKey: getListSkillsQueryKey() })
      toast({ title: "Skill imported", description: `"${data.name}" added to your library.` })
      setImportOpen(false)
      setImportContent("")
      setImportIsearch(false)
      setLocation(`/skills/${data.id}`)
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message || "Invalid SKILL.md", variant: "destructive" })
    } finally {
      setImporting(false)
    }
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto w-full flex-1 flex flex-col gap-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-serif text-5xl mb-3">Skills Library</h1>
            <p className="text-muted-foreground text-lg">Manage and curate your automated capabilities.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button variant="outline" size="lg" onClick={() => setImportOpen(true)}>
              <Upload className="h-5 w-5 mr-2" />
              Import SKILL.md
            </Button>
            <Button size="lg" onClick={() => setLocation("/skills/new")} className="shadow-md">
              <Plus className="h-5 w-5 mr-2" />
              Create Skill
            </Button>
          </div>
        </header>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Skills</p>
                <p className="text-3xl font-serif mt-1">{statsLoading ? "-" : stats?.totalSkills}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Skills</p>
                <p className="text-3xl font-serif mt-1">{statsLoading ? "-" : stats?.activeSkills}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Activations</p>
                <p className="text-3xl font-serif mt-1">{statsLoading ? "-" : stats?.totalUses}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Skills List */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-widest font-black text-accent">All Skills</h2>
          </div>

          {skillsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6 h-24" />
                </Card>
              ))}
            </div>
          ) : !skills || skills.length === 0 ? (
            <div className="text-center py-24 bg-card border border-border rounded-3xl">
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-serif text-2xl mb-2">No skills yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first skill to automate knowledge retrieval, formatting, or task execution.
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => setImportOpen(true)}>Import SKILL.md</Button>
                <Button onClick={() => setLocation("/skills/new")}>Create your first skill</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {skills.map(skill => (
                <Link key={skill.id} href={`/skills/${skill.id}`}>
                  <Card className="group cursor-pointer hover:border-primary/50 transition-colors h-full flex flex-col">
                    <CardHeader>
                      <div className="flex items-start justify-between mb-2">
                        <CardTitle className="text-xl line-clamp-1 group-hover:text-primary transition-colors">{skill.name}</CardTitle>
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${skill.enabled ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                      </div>
                      <CardDescription className="line-clamp-2">{skill.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" />
                        {skill.usageCount} uses
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {skill.lastUsedAt ? format(new Date(skill.lastUsedAt), "MMM d, yyyy") : "Never used"}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Import SKILL.md Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Import Anthropic SKILL.md</DialogTitle>
            <DialogDescription>
              Paste or upload a SKILL.md file. The <code className="text-xs bg-muted px-1 rounded">name</code> and{" "}
              <code className="text-xs bg-muted px-1 rounded">description</code> come from the YAML frontmatter; the
              markdown body becomes the instructions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept=".md,.txt" className="hidden" onChange={handleFileUpload} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Upload file
              </Button>
              <span className="text-xs text-muted-foreground">or paste below</span>
            </div>

            <Textarea
              placeholder={`---\nname: my-skill-name\ndescription: When the user asks about X, apply this skill\n---\n\n# My Skill\n\nInstructions here...`}
              className="min-h-[220px] font-mono text-xs"
              value={importContent}
              onChange={e => {
                setImportContent(e.target.value)
                setImportIsearch(detectIsearch(e.target.value))
              }}
            />

            <div className="flex items-center justify-between border border-border rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4 text-amber-500" /> Enable iSearch
                </p>
                <p className="text-xs text-muted-foreground">Auto web search when this skill activates</p>
              </div>
              <Switch checked={importIsearch} onCheckedChange={setImportIsearch} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Importing…" : "Import Skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
