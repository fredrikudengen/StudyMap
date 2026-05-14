import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { authFetch } from '../api'
import Navbar from '../components/Navbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function examDaysLabel(examDateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = examDateStr.split('-').map(Number)
  const exam = new Date(y, m - 1, d)
  const days = Math.round((exam - today) / 86400000)
  if (days > 0) {
    const cls = days <= 7 ? 'text-amber-600 font-medium' : 'text-muted-foreground'
    return <p className={`text-xs mt-0.5 ${cls}`}>{days} dager til eksamen</p>
  }
  if (days === 0) return <p className="text-xs mt-0.5 text-amber-600 font-medium">Eksamen i dag!</p>
  return <p className="text-xs mt-0.5 text-muted-foreground">Eksamen var for {Math.abs(days)} dager siden</p>
}

function StatusPill({ count, label, className }) {
  return (
    <Badge variant="outline" className={className}>
      {count} {label}
    </Badge>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingSubjectId, setEditingSubjectId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editExamDate, setEditExamDate] = useState('')

  function startEditSubject(e, subject) {
    e.stopPropagation()
    setEditingSubjectId(subject.id)
    setEditName(subject.name)
    setEditExamDate(subject.exam_date ?? '')
  }

  async function handleSaveSubject(subjectId) {
    if (!editName.trim()) return
    try {
      const res = await authFetch(`/api/subjects/${subjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), exam_date: editExamDate || null }),
      })
      if (!res.ok) throw new Error('Kunne ikke oppdatere emnet')
      setSubjects(prev => prev.map(s =>
        s.id === subjectId ? { ...s, name: editName.trim(), exam_date: editExamDate || null } : s
      ))
      setEditingSubjectId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteSubject(e, subjectId) {
    e.stopPropagation()
    if (!window.confirm('Slett dette emnet? Alle temaer og testresultater vil også slettes.')) return
    try {
      const res = await authFetch(`/api/subjects/${subjectId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Kunne ikke slette emnet')
      setSubjects(prev => prev.filter(s => s.id !== subjectId))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch('/api/subjects')
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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
          <h1 className="text-2xl font-bold">Mine emner</h1>
          <Button onClick={() => navigate('/subjects/new')}>
            + Nytt emne
          </Button>
        </div>

        {subjects.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ingen emner ennå. Opprett ditt første emne!</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {subjects.map(subject => {
              const { kan_godt, usikker, ikke_testet } = subject.topic_counts
              const total = kan_godt + usikker + ikke_testet
              return (
                <li key={subject.id}>
                  {editingSubjectId === subject.id ? (
                    <Card className="border-l-[3px]" style={{ borderLeftColor: 'hsl(var(--primary))' }}>
                      <CardContent className="px-5 py-4 flex flex-col gap-2">
                        <input
                          autoFocus
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveSubject(subject.id); if (e.key === 'Escape') setEditingSubjectId(null) }}
                          className="w-full border border-input bg-background rounded-md px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <input
                          type="date"
                          value={editExamDate}
                          onChange={e => setEditExamDate(e.target.value)}
                          className="w-full border border-input bg-background rounded-md px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveSubject(subject.id)} disabled={!editName.trim()}>Lagre</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingSubjectId(null)}>Avbryt</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <button
                      onClick={() => navigate(`/subjects/${subject.id}/topics`)}
                      className="w-full text-left"
                    >
                      <Card
                        className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 border-l-[3px]"
                        style={{ borderLeftColor: 'hsl(var(--primary))' }}
                      >
                        <CardContent className="px-5 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-semibold text-foreground">{subject.name}</p>
                              {subject.exam_date && (
                                <>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Eksamen {new Date(subject.exam_date).toLocaleDateString('no-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
                                  </p>
                                  {examDaysLabel(subject.exam_date)}
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs text-muted-foreground mr-0.5">{total} temaer</span>
                              <button
                                onClick={(e) => startEditSubject(e, subject)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={(e) => handleDeleteSubject(e, subject.id)}
                                className="text-muted-foreground hover:text-red-500 transition-colors p-0.5"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          {total > 0 && (
                            <>
                              <div className="flex flex-wrap gap-1.5 mt-3">
                                {kan_godt > 0 && <StatusPill count={kan_godt} label="kan godt" className="bg-green-50 text-green-700 border-green-200" />}
                                {usikker > 0 && <StatusPill count={usikker} label="usikker" className="bg-red-50 text-red-600 border-red-200" />}
                                {ikke_testet > 0 && <StatusPill count={ikke_testet} label="ikke testet" className="bg-secondary text-muted-foreground border-border" />}
                              </div>
                              <div className="mt-3 h-1 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.round((kan_godt / total) * 100)}%`,
                                    backgroundColor: 'hsl(var(--primary))',
                                  }}
                                />
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
