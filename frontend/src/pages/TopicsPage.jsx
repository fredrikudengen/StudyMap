import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

function statusLabel(lastResult) {
  if (!lastResult) return { label: 'Ikke testet', color: 'bg-gray-100 text-gray-500' }
  if (lastResult.flagged_by_user) return { label: 'Flagget', color: 'bg-orange-100 text-orange-600' }
  if (lastResult.score === 1) return { label: 'Kan godt', color: 'bg-green-100 text-green-700' }
  return { label: 'Usikker', color: 'bg-red-100 text-red-600' }
}

export default function TopicsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/topics?subject_id=${id}`)
        if (!res.ok) throw new Error('Kunne ikke hente temaer')
        const data = await res.json()

        if (data.length === 0) {
          const genRes = await fetch(`/api/subjects/${id}/generate-topics`, { method: 'POST' })
          if (!genRes.ok && genRes.status !== 409) throw new Error('Kunne ikke generere temaer')

          if (genRes.status === 409) {
            const retry = await fetch(`/api/topics?subject_id=${id}`)
            if (!retry.ok) throw new Error('Kunne ikke hente temaer')
            setTopics(await retry.json())
          } else {
            const generated = await genRes.json()
            setTopics(generated.map(t => ({ ...t, last_result: null })))
          }
        } else {
          setTopics(data)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Henter temaer...</p>
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
      <h1 className="text-2xl font-bold mb-6">Temaer</h1>

      <ul className="flex flex-col gap-3">
        {topics.map(topic => {
          const { label, color } = statusLabel(topic.last_result)
          return (
            <li key={topic.id} className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{topic.name}</span>
                {topic.often_on_exam && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">
                    Ofte på eksamen
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${color}`}>
                  {label}
                </span>
                <button
                  onClick={() => navigate(`/subjects/${id}/topic/${topic.id}/test`)}
                  className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 font-medium hover:bg-blue-700 transition-colors"
                >
                  Test
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
