import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
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
  const location = useLocation()
  const curriculumText = location.state?.curriculum_text ?? null
  const fileInputRef = useRef(null)

  const [topics, setTopics] = useState([])
  const [subjectName, setSubjectName] = useState(null)
  const [editingTopicId, setEditingTopicId] = useState(null)
  const [editTopicName, setEditTopicName] = useState('')
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    authFetch('/api/subjects')
      .then(r => r.ok ? r.json() : null)
      .then(list => {
        if (!list) return
        const s = list.find(s => s.id === Number(id))
        if (s) setSubjectName(s.name)
      })
      .catch(() => {})
  }, [id])

  const loadTopics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/topics?subject_id=${id}`)
      if (!res.ok) throw new Error('Kunne ikke hente temaer')
      const data = await res.json()

      if (data.length === 0) {
        const genRes = await authFetch(`/api/subjects/${id}/generate-topics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ curriculum_text: curriculumText }),
        })
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
  }, [id, curriculumText])

  useEffect(() => { loadTopics() }, [loadTopics])

  async function handleSaveTopic(topicId) {
    if (!editTopicName.trim()) return
    try {
      const res = await authFetch(`/api/topics/${topicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editTopicName.trim() }),
      })
      if (!res.ok) throw new Error('Kunne ikke oppdatere tema')
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, name: editTopicName.trim() } : t))
      setEditingTopicId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteTopic(topicId) {
    if (!window.confirm('Slett dette temaet? Alle testresultater for temaet vil også slettes.')) return
    try {
      const res = await authFetch(`/api/topics/${topicId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Kunne ikke slette tema')
      setTopics(prev => prev.filter(t => t.id !== topicId))
    } catch (err) {
      setError(err.message)
    }
  }

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
      const summary = await res.json()
      await loadTopics()

      const parts = []
      if (summary.topics_tagged > 0) parts.push(`${summary.topics_tagged} temaer tagget som ofte på eksamen`)
      if (summary.new_topics_created > 0) parts.push(`${summary.new_topics_created} nye temaer lagt til`)
      if (summary.dependencies_added > 0) parts.push(`${summary.dependencies_added} avhengigheter oppdaget`)

      if (parts.length > 0) {
        toast.success(parts.join(', '))
      } else {
        toast('Eksamen analysert — ingen endringer')
      }
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
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-destructive text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={loadTopics}>Prøv igjen</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-2xl mx-auto w-full px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="text-muted-foreground -ml-2 mb-0.5">
              ← Mine emner
            </Button>
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-2xl font-bold">Temaer</h1>
              {subjectName && <span className="text-sm text-muted-foreground">{subjectName}</span>}
            </div>
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
                {editingTopicId === topic.id ? (
                  <CardContent className="flex items-center gap-2 px-4 py-2.5">
                    <input
                      autoFocus
                      type="text"
                      value={editTopicName}
                      onChange={e => setEditTopicName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveTopic(topic.id); if (e.key === 'Escape') setEditingTopicId(null) }}
                      className="flex-1 border border-input bg-background rounded-md px-2.5 py-1 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button size="sm" onClick={() => handleSaveTopic(topic.id)} disabled={!editTopicName.trim()}>Lagre</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTopicId(null)}>Avbryt</Button>
                  </CardContent>
                ) : (
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
                      <Button size="sm" onClick={() => navigate(`/subjects/${id}/topic/${topic.id}/test`, { state: { topicName: topic.name, subjectName } })}>
                        Test
                      </Button>
                      <button
                        onClick={() => { setEditingTopicId(topic.id); setEditTopicName(topic.name) }}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteTopic(topic.id)}
                        className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </CardContent>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
