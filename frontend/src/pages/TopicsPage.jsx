import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { authFetch } from '../api'
import Navbar from '../components/Navbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function topicBorderColor(lastResult) {
  if (!lastResult) return 'hsl(var(--border))'
  if (lastResult.flagged_by_user) return '#fb923c'
  if (lastResult.score === 1) return '#4ade80'
  return '#f87171'
}

function StatusBadge({ lastResult }) {
  if (!lastResult) return <Badge variant="outline" className="bg-secondary text-muted-foreground border-border">Ikke testet</Badge>
  if (lastResult.flagged_by_user) return <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">Flagget</Badge>
  if (lastResult.score === 1) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Kan godt</Badge>
  return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Usikker</Badge>
}

export default function TopicsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)

  const loadTopics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/topics?subject_id=${id}`)
      if (!res.ok) throw new Error('Kunne ikke hente temaer')
      const data = await res.json()

      if (data.length === 0) {
        const genRes = await authFetch(`/api/subjects/${id}/generate-topics`, { method: 'POST' })
        if (!genRes.ok && genRes.status !== 409) throw new Error('Kunne ikke generere temaer')
        if (genRes.status === 409) {
          const retry = await authFetch(`/api/topics?subject_id=${id}`)
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
  }, [id])

  useEffect(() => { loadTopics() }, [loadTopics])

  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setAnalyzing(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await authFetch(`/api/subjects/${id}/analyze-exam`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Kunne ikke analysere eksamen')
      await loadTopics()
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Henter temaer...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-2xl mx-auto w-full px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="text-muted-foreground -ml-2">
              ← Mine emner
            </Button>
            <h1 className="text-2xl font-bold">Temaer</h1>
          </div>
          <div className="flex items-center gap-2">
            {analyzing && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Analyserer...
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
            <Button variant="outline" size="sm" onClick={() => navigate(`/subjects/${id}/graph`)}>
              Graf
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={analyzing}>
              Last opp eksamen
            </Button>
          </div>
        </div>

        <ul className="flex flex-col gap-2.5">
          {topics.map(topic => (
            <li key={topic.id}>
              <Card className="border-l-[3px]" style={{ borderLeftColor: topicBorderColor(topic.last_result) }}>
                <CardContent className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{topic.name}</span>
                    {topic.often_on_exam && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                        Ofte på eksamen
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge lastResult={topic.last_result} />
                    <Button size="sm" onClick={() => navigate(`/subjects/${id}/topic/${topic.id}/test`)}>
                      Test
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
