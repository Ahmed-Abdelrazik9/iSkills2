import React, { useEffect, useRef, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { 
  useGetSkill, 
  useUpdateSkill, 
  useDeleteSkill,
  getGetSkillQueryKey,
  getListSkillsQueryKey 
} from "@workspace/api-client-react"
import { useLocation, useParams } from "wouter"
import { AppLayout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Loader2, Plus, X, Trash2, Play, CheckCircle2, XCircle, Globe } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const skillSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  instructions: z.string().min(1, "Instructions are required"),
  enabled: z.boolean(),
  isearch: z.boolean(),
  priority: z.coerce.number().min(0).max(100),
  triggerExamples: z.array(z.object({ value: z.string().min(1, "Example cannot be empty") }))
})

export default function SkillEdit() {
  const params = useParams()
  const id = params.id as string
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const [testMessage, setTestMessage] = useState("")
  const [testResult, setTestResult] = useState<any>(null)

  const { data: skill, isLoading } = useGetSkill(id, { 
    query: { enabled: !!id, queryKey: getGetSkillQueryKey(id) } 
  })

  const form = useForm<z.infer<typeof skillSchema>>({
    resolver: zodResolver(skillSchema),
    defaultValues: {
      name: "",
      description: "",
      instructions: "",
      enabled: true,
      isearch: false,
      priority: 50,
      triggerExamples: [{ value: "" }]
    }
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "triggerExamples"
  })

  // Initialize form with data
  const initialized = useRef(false)
  useEffect(() => {
    if (skill && !initialized.current) {
      form.reset({
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        enabled: skill.enabled,
        isearch: skill.isearch,
        priority: skill.priority,
        triggerExamples: skill.triggerExamples.length > 0 
          ? skill.triggerExamples.map(v => ({ value: v }))
          : [{ value: "" }]
      })
      initialized.current = true
    }
  }, [skill, form])

  const updateSkill = useUpdateSkill()
  const deleteSkill = useDeleteSkill()
  const [isTesting, setIsTesting] = useState(false)

  const onSubmit = (data: z.infer<typeof skillSchema>) => {
    const payload = {
      ...data,
      triggerExamples: data.triggerExamples.map(t => t.value)
    }
    
    updateSkill.mutate({ id, data: payload }, {
      onSuccess: (res) => {
        queryClient.setQueryData(getGetSkillQueryKey(id), res)
        queryClient.invalidateQueries({ queryKey: getListSkillsQueryKey() })
        toast({ title: "Skill updated", description: "Changes have been saved successfully." })
      },
      onError: (err) => {
        toast({ title: "Error updating", description: (err as any)?.response?.data?.error || "An error occurred", variant: "destructive" })
      }
    })
  }

  const handleDelete = () => {
    deleteSkill.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSkillsQueryKey() })
        toast({ title: "Skill deleted", description: "The skill has been permanently removed." })
        setLocation("/dashboard")
      },
      onError: (err) => {
        toast({ title: "Error deleting", description: (err as any)?.response?.data?.error || "Could not delete", variant: "destructive" })
      }
    })
  }

  const handleTest = async () => {
    if (!testMessage.trim()) return
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/iskills2/skills/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMessage })
      })
      if (!res.ok) throw new Error(await res.text())
      setTestResult(await res.json())
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message || "Could not run test", variant: "destructive" })
    } finally {
      setIsTesting(false)
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    )
  }

  if (!skill) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-muted-foreground">Skill not found</p>
          <Button onClick={() => setLocation("/dashboard")}>Back to Library</Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        <div className="lg:col-span-2 flex flex-col">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <Button variant="ghost" size="sm" className="mb-4 -ml-4" onClick={() => setLocation("/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Library
              </Button>
              <h1 className="font-serif text-4xl">{skill.name}</h1>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Skill?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the skill "{skill.name}".
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {deleteSkill.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Delete Permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </header>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-6 bg-card border border-border p-8 rounded-3xl shadow-sm">
                <h2 className="text-xs uppercase tracking-widest font-black text-accent mb-4">Core Identity</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Skill Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority (0-100)</FormLabel>
                        <FormControl>
                          <Input type="text" inputMode="numeric" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description / Trigger Rule</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-6 bg-card border border-border p-8 rounded-3xl shadow-sm">
                <h2 className="text-xs uppercase tracking-widest font-black text-accent mb-4">Behavior</h2>
                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Instructions</FormLabel>
                      <FormControl>
                        <Textarea className="min-h-[250px]" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-6 bg-card border border-border p-8 rounded-3xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs uppercase tracking-widest font-black text-accent">Trigger Examples</h2>
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ value: "" })}>
                    <Plus className="h-4 w-4 mr-2" /> Add Example
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-start">
                      <FormField
                        control={form.control}
                        name={`triggerExamples.${index}.value`}
                        render={({ field: inputField }) => (
                          <FormItem className="flex-1 space-y-0">
                            <FormControl>
                              <Input {...inputField} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between bg-card border border-border p-6 rounded-3xl shadow-sm">
                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between w-full space-y-0">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enable Skill</FormLabel>
                        <FormDescription>Active skills will be evaluated against new messages.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-between bg-card border border-border p-6 rounded-3xl shadow-sm">
                <FormField
                  control={form.control}
                  name="isearch"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between w-full space-y-0">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Enable iSearch</FormLabel>
                        <FormDescription>When active, this skill will automatically request web search for current information.</FormDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className={field.value ? "h-5 w-5 text-amber-500 animate-pulse" : "h-5 w-5 text-muted-foreground opacity-80"} />
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-4 pb-12">
                <Button type="submit" size="lg" disabled={updateSkill.isPending || !form.formState.isDirty} className="shadow-md">
                  {updateSkill.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </div>

        {/* Test Panel */}
        <div className="lg:col-span-1 lg:sticky lg:top-8 flex flex-col bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border bg-background/50">
            <h2 className="text-lg font-serif mb-2 flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              Test Panel
            </h2>
            <p className="text-muted-foreground text-sm">
              See if a message would trigger this skill and what gets injected.
            </p>
          </div>
          
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest font-black text-accent block mb-2">Simulated User Message</label>
              <Textarea 
                placeholder="Type a message here..." 
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="min-h-[100px] font-sans"
              />
            </div>
            <Button className="w-full" onClick={handleTest} disabled={isTesting || !testMessage.trim()}>
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Run Test
            </Button>
          </div>

          {testResult && (
            <div className="p-6 bg-background/50 border-t border-border space-y-6">
              <div className="flex items-center gap-3">
                {testResult.matched ? (
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <XCircle className="h-6 w-6 text-red-500" />
                  </div>
                )}
                <div>
                  <p className="font-bold">{testResult.matched ? "Match Found" : "No Match"}</p>
                  <p className="text-sm text-muted-foreground">
                    Confidence score: <span className="font-mono">{testResult.confidence?.toFixed(2) || "N/A"}</span>
                  </p>
                </div>
              </div>

              {testResult.matched && testResult.skill && (
                <>
                  <div>
                    <label className="text-xs uppercase tracking-widest font-black text-accent block mb-2">Matched Skill</label>
                    <p className="text-sm font-medium text-slate-800">{testResult.skill.name}</p>
                    <p className="text-xs text-muted-foreground">{testResult.reason}</p>
                  </div>
                  {testResult.needsSearch && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-sm font-medium text-blue-800">iSearch triggered</p>
                      <p className="text-xs text-blue-600 font-mono mt-1">{testResult.searchQuery}</p>
                    </div>
                  )}
                  {testResult.searchResults && testResult.searchResults.length > 0 && (
                    <div>
                      <label className="text-xs uppercase tracking-widest font-black text-accent block mb-2">Live Search Results</label>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {testResult.searchResults.map((result, idx) => (
                          <a
                            key={idx}
                            href={result.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block bg-muted p-3 rounded-xl border border-border hover:border-accent transition-colors"
                          >
                            <p className="text-sm font-medium text-slate-800">{result.title}</p>
                            <p className="text-xs text-blue-600 truncate">{result.url}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.snippet}</p>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs uppercase tracking-widest font-black text-accent block mb-2">Instructions</label>
                    <div className="bg-muted p-4 rounded-xl text-sm font-mono whitespace-pre-wrap text-muted-foreground max-h-64 overflow-y-auto border border-border">
                      {testResult.skill.instructions}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  )
}
