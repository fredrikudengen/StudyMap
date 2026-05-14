import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 flex flex-col items-center justify-center px-6">
      <div className="text-center text-white max-w-md">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4">StudyMap</h1>
        <p className="text-indigo-100 text-lg leading-relaxed mb-12">
          Kartlegg hva du kan og hva du trenger å øve mer på.
          Adaptive tester og emneoversikt i ett.
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => navigate('/register')}
            size="lg"
            className="bg-white text-indigo-700 hover:bg-white/90 shadow-lg border-0 font-semibold"
          >
            Registrer deg
          </Button>
          <Button
            onClick={() => navigate('/login')}
            size="lg"
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white font-semibold"
          >
            Logg inn
          </Button>
        </div>
      </div>
    </div>
  )
}
