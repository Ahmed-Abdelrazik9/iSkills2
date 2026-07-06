import { useLocation } from "wouter"
import { AppLayout } from "@/components/layout"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  const [, setLocation] = useLocation()

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
        <h1 className="text-6xl font-serif mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">This page could not be found.</p>
        <Button onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    </AppLayout>
  )
}
