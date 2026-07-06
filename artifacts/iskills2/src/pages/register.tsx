import React from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRegisterUser, getGetMeQueryKey } from "@workspace/api-client-react"
import { Link, useLocation } from "wouter"
import { setToken } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { PenTool, Loader2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters")
})

export default function Register() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "" }
  })

  const register = useRegisterUser()

  const onSubmit = (data: z.infer<typeof registerSchema>) => {
    register.mutate({ data }, {
      onSuccess: (res) => {
        setToken(res.token)
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
        setLocation("/dashboard")
      },
      onError: (err) => {
        toast({
          title: "Registration failed",
          description: (err as any)?.response?.data?.error || "An error occurred",
          variant: "destructive"
        })
      }
    })
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-full bg-gradient-gold flex items-center justify-center mb-6">
            <PenTool className="h-6 w-6 text-white" />
          </div>
          <h1 className="font-serif text-4xl mb-2 text-foreground">Craft your tools</h1>
          <p className="text-muted-foreground text-center">Join iSkills2 to build your personalized AI capabilities.</p>
        </div>

        <div className="bg-card border border-border p-8 rounded-3xl shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-widest font-black text-accent">Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-widest font-black text-accent">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={register.isPending}>
                {register.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
            </form>
          </Form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
