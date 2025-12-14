import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "sonner"
import { AuthProvider } from "@/context/AuthContext"

function App() {
  return (
    <AuthProvider>
      <Pages />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  )
}

export default App
