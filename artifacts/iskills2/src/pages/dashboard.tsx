import React from "react"
import { useListSkills, useGetStats, getListSkillsQueryKey } from "@workspace/api-client-react"
import { Link, useLocation } from "wouter"
import { AppLayout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Plus, Search, Activity, BookOpen, Clock, Zap } from "lucide-react"
import { format } from "date-fns"

export default function Dashboard() {
  const { data: skills, isLoading: skillsLoading } = useListSkills({ query: { queryKey: getListSkillsQueryKey() } })
  const { data: stats, isLoading: statsLoading } = useGetStats()
  const [, setLocation] = useLocation()

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto w-full flex-1 flex flex-col gap-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-serif text-5xl mb-3">Skills Library</h1>
            <p className="text-muted-foreground text-lg">Manage and curate your automated capabilities.</p>
          </div>
          <Button size="lg" onClick={() => setLocation("/skills/new")} className="shrink-0 shadow-md">
            <Plus className="h-5 w-5 mr-2" />
            Create Skill
          </Button>
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
              <Button onClick={() => setLocation("/skills/new")}>Create your first skill</Button>
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
    </AppLayout>
  )
}
