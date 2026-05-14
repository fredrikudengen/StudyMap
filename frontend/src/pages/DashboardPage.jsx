import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function StatusPill({ count, label, color }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {count} {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/subjects')
        if (!res.ok) throw new Error('Kunne ikke hente emner')
        setSubjects(await res.json())
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mine emner</h1>
        <button
          onClick={() => navigate('/')}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Nytt emne
        </button>
      </div>

      {subjects.length === 0 ? (
        <p className="text-gray-500 text-sm">Ingen emner ennå. Opprett ditt første emne!</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {subjects.map(subject => {
            const { kan_godt, usikker, ikke_testet } = subject.topic_counts
            const total = kan_godt + usikker + ikke_testet
            return (
              <li key={subject.id}>
                <button
                  onClick={() => navigate(`/subjects/${subject.id}/topics`)}
                  className="w-full text-left bg-white rounded-xl shadow-sm px-5 py-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900">{subject.name}</p>
                      {subject.exam_date && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Eksamen {new Date(subject.exam_date).toLocaleDateString('no-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{total} temaer</span>
                  </div>

                  {total > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {kan_godt > 0 && <StatusPill count={kan_godt} label="kan godt" color="bg-green-100 text-green-700" />}
                      {usikker > 0 && <StatusPill count={usikker} label="usikker" color="bg-red-100 text-red-600" />}
                      {ikke_testet > 0 && <StatusPill count={ikke_testet} label="ikke testet" color="bg-gray-100 text-gray-500" />}
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
