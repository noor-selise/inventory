import { AuthProvider } from "@/app/providers/AuthProvider"
import { CurrentUserProvider } from "@/app/providers/CurrentUserProvider"
import { NavigationProvider } from "@/app/router/navigation"
import { AppRouter } from "@/app/router/routes"
import { Toaster } from "@/components/ui/sonner"

export function App() {
  return (
    <NavigationProvider>
      <AuthProvider>
        <CurrentUserProvider>
          <AppRouter />
          <Toaster position="bottom-right" />
        </CurrentUserProvider>
      </AuthProvider>
    </NavigationProvider>
  )
}

export default App
