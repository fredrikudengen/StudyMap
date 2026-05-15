import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const FEATURES = [
  {
    number: '01',
    title: 'Adaptive tester',
    desc: 'Starter alltid med det du ikke kan.',
  },
  {
    number: '02',
    title: 'Kunnskapsgraf',
    desc: 'Se sammenhenger mellom temaer og hvilke som er forutsetninger for andre.',
  },
  {
    number: '03',
    title: 'Spaced repetition',
    desc: 'Kun temaer som trenger øving dukker.',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-700 flex flex-col items-center justify-center px-6 py-20 relative overflow-hidden">
      {/* Radial glow behind hero */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '-10%' }}>
        <div
          className="w-[600px] h-[600px] rounded-full animate-glow"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 70%)' }}
        />
      </div>
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 320,
          height: 320,
          top: '8%',
          right: '12%',
          background: 'radial-gradient(circle, rgba(251,191,36,0.12) 0%, transparent 65%)',
        }}
      />

      {/* Hero */}
      <div className="relative text-center text-white max-w-lg mb-14">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4">StudieKart</h1>
        <p className="text-teal-100 text-lg leading-relaxed mb-10">
          Kartlegg hva du kan og hva du trenger å øve mer på.
          Adaptive tester og emneoversikt i ett.
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => navigate('/register')}
            size="lg"
            className="bg-white text-teal-700 hover:bg-white/90 shadow-lg border-0 font-semibold"
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

      {/* Feature cards */}
      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
        {FEATURES.map(f => (
          <div
            key={f.number}
            className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/10 text-white"
          >
            <p className="text-xs font-bold text-teal-200 tracking-widest mb-2">{f.number}</p>
            <p className="font-semibold text-sm mb-1.5">{f.title}</p>
            <p className="text-teal-100/80 text-xs leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
