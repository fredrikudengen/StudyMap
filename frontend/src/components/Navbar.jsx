import { useNavigate } from 'react-router-dom'
import { clearToken } from '../api'
import { Button } from '@/components/ui/button'

export default function Navbar() {
  const navigate = useNavigate()
  return (
    <nav className="bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-6 h-14 flex items-center justify-between shrink-0 z-10">
      <button
        onClick={() => navigate('/dashboard')}
        className="text-lg font-bold text-primary tracking-tight hover:opacity-80 transition-opacity"
      >
        StudyMap
      </button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { clearToken(); navigate('/login') }}
        className="text-muted-foreground hover:text-foreground"
      >
        Logg ut
      </Button>
    </nav>
  )
}
