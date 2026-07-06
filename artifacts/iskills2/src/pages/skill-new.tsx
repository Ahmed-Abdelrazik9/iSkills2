import React from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCreateSkill, useGenerateSkill, getListSkillsQueryKey } from "@workspace/api-client-react"
import { useLocation } from "wouter"
import { AppLayout } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { Wand2, ArrowLeft, Loader2, Plus, X } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"

const skillSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  instructions: z.string().min(1, "Instructions are required"),
  enabled: z.boolean().default(true),
  priority: z.coerce.number().min(0).max(100).default(50),
  triggerExamples: z.array(z.object({ value: z.string().min(1, "Example cannot be empty") }))
})

export default function SkillNew() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = React.useState("")
  
  const form = useForm<z.infer<typeof skillSchema>>({
    resolver: zodResolver(skillSchema),
    defaultValues: {
      name: "",
      description: "",
      instructions: "",
      enabled: true,
      priority: 50,
      triggerExamples: [{ value: "" }]
    }
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "triggerExamples"
  })

  const createSkill = useCreateSkill()
  const generateSkill = useGenerateSkill()

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({ title: "Prompt required", description: "Please enter a description for the AI", variant: "destructive" })
      return
    }
    
    generateSkill.mutate({ data: { prompt } }, {
      onSuccess: (data) => {
        form.setValue("name", data.name)
        form.setValue("description", data.description)
        form.setValue("instructions", data.instructions)
        form.setValue("triggerExamples", data.triggerExamples.map(v => ({ value: v })))
        toast({ title: "Skill generated", description: "Fields have been populated. Please review and save." })
      },
      onError: (err) => {
        toast({ title: "Generation failed", description: (err as any)?.response?.data?.error || "Could not generate skill", variant: "destructive" })
      }
    })
  }

  const onSubmit = (data: z.infer<typeof skillSchema>) => {
    const payload = {
      ...data,
      triggerExamples: data.triggerExamples.map(t => t.value)
    }
    
    createSkill.mutate({ data: payload }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getListSkillsQueryKey() })
        toast({ title: "Skill created", description: "Your new skill has been saved." })
        setLocation(`/skills/${res.id}`)
      },
      onError: (err) => {
        toast({ title: "Error creating skill", description: (err as any)?.response?.data?.error || "An error occurred", variant: "destructive" })
      }
    })
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto w-full flex-1 flex flex-col">
        <header className="mb-8">
          <Button variant="ghost" size="sm" className="mb-4 -ml-4" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Library
          </Button>
          <h1 className="font-serif text-4xl">Craft New Skill</h1>
        </header>

        {/* AI Generator Panel */}
        <div className="bg-gradient-to-r from-card to-primary/5 border border-border p-6 rounded-3xl mb-12 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          <h2 className="text-lg font-serif mb-2 flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Generate with AI
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            Describe what you want this skill to do, and AI will draft the instructions and triggers.
          </p>
          <div className="flex gap-4">
            <Input 
              placeholder="e.g. A skill that formats any code snippet into a clean markdown code block with explanations..." 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-background/50 backdrop-blur-sm"
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            />
            <Button onClick={handleGenerate} disabled={generateSkill.isPending} className="shrink-0 shadow-md">
              {generateSkill.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Draft Skill
            </Button>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
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
                        <Input placeholder="e.g. Code Formatter" {...field} />
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
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>Higher priority skills are evaluated first.</FormDescription>
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
                      <Input placeholder="Describe exactly when this skill should activate" {...field} />
                    </FormControl>
                    <FormDescription>The AI uses this to determine if the skill matches a user's prompt.</FormDescription>
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
                      <Textarea 
                        placeholder="You are an expert code reviewer. When the user posts code, you must..." 
                        className="min-h-[200px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>This text is injected into the AI's prompt when the skill activates.</FormDescription>
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
              <p className="text-sm text-muted-foreground mb-4">Provide sample prompts that should activate this skill.</p>
              
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <FormField
                      control={form.control}
                      name={`triggerExamples.${index}.value`}
                      render={({ field: inputField }) => (
                        <FormItem className="flex-1 space-y-0">
                          <FormControl>
                            <Input placeholder="e.g. Please format this python script" {...inputField} />
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

            <div className="flex justify-end gap-4 pb-12">
              <Button type="button" variant="ghost" onClick={() => setLocation("/dashboard")}>Cancel</Button>
              <Button type="submit" size="lg" disabled={createSkill.isPending} className="shadow-md">
                {createSkill.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Save Skill
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  )
}
