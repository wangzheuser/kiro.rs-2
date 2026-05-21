import { useState, useEffect, lazy, Suspense } from 'react'
import { storage } from '@/lib/storage'
import { LoginPage } from '@/components/login-page'
import { Toaster } from '@/components/ui/sonner'

const Dashboard = lazy(() =>
  import('@/components/dashboard').then((m) => ({ default: m.Dashboard })),
)

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    // 检查是否已经有保存的 API Key
    if (storage.getApiKey()) {
      setIsLoggedIn(true)
    }
  }, [])

  const handleLogin = () => {
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
  }

  return (
    <>
      {isLoggedIn ? (
        <Suspense fallback={null}>
          <Dashboard onLogout={handleLogout} />
        </Suspense>
      ) : (
        <LoginPage onLogin={handleLogin} />
      )}
      <Toaster position="top-center" />
    </>
  )
}

export default App
