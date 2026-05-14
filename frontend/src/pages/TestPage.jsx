import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { authFetch } from '../api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const FT_TOTAL = 3

function optionStyle(index, selectedIndex, correctIndex) {
  if (selectedIndex === null) {
    return 'border-border bg-card hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
  }
  if (index === correctIndex) return 'border-green-500 bg-green-50 text-green-800'
  if (index === selectedIndex) return 'border-red-400 bg-red-50 text-red-800'
  return 'border-border bg-card text-muted-foreground'
}

function scoreLabel(score) {
  if (score === 1) return { text: 'Riktig', cls: 'text-green-700 bg-green-50 border-green-300' }
  if (score === 0.5) return { text: 'Delvis riktig', cls: 'text-yellow-700 bg-yellow-50 border-yellow-300' }
  return { text: 'Feil', cls: 'text-red-700 bg-red-50 border-red-300' }
}

export default function TestPage() {
  const { subjectId, topicId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const topicName = location.state?.topicName ?? null
  const subjectName = location.state?.subjectName ?? null

  const [mode, setMode] = useState('mc')

  // MC state
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [mcResultId, setMcResultId] = useState(null)
  const [mcFlagged, setMcFlagged] = useState(false)
  const [mcLoading, setMcLoading] = useState(true)
  const [mcSaving, setMcSaving] = useState(false)

  // Freetext state
  const [ftQuestion, setFtQuestion] = useState(null)
  const [ftAnswer, setFtAnswer] = useState('')
  const [ftEval, setFtEval] = useState(null)
  const [ftCount, setFtCount] = useState(1)
  const [ftResultId, setFtResultId] = useState(null)
  const [ftFlagged, setFtFlagged] = useState(false)
  const [ftLoading, setFtLoading] = useState(false)
  const [ftSubmitting, setFtSubmitting] = useState(false)

  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadMcQuestions() {
      try {
        const res = await authFetch(`/api/topics/${topicId}/generate-question`, { method: 'POST' })
        if (!res.ok) throw new Error('Kunne ikke generere spørsmål')
        setQuestions(await res.json())
      } catch (err) {
        setError(err.message)
      } finally {
        setMcLoading(false)
      }
    }
    loadMcQuestions()
  }, [topicId])

  async function loadFtQuestion() {
    setFtLoading(true)
    setFtQuestion(null)
    setFtAnswer('')
    setFtEval(null)
    setFtResultId(null)
    setFtFlagged(false)
    try {
      const res = await authFetch(`/api/topics/${topicId}/generate-freetext-question`, { method: 'POST' })
      if (!res.ok) throw new Error('Kunne ikke generere spørsmål')
      const data = await res.json()
      setFtQuestion(data.question)
    } catch (err) {
      setError(err.message)
    } finally {
      setFtLoading(false)
    }
  }

  function switchMode(newMode) {
    if (newMode === mode) return
    setMode(newMode)
    if (newMode === 'freetext' && ftQuestion === null && !ftLoading) {
      setFtCount(1)
      loadFtQuestion()
    }
  }

  async function handleFtSubmit() {
    if (!ftAnswer.trim() || ftSubmitting) return
    setFtSubmitting(true)
    try {
      const res = await authFetch('/api/test-results/evaluate-freetext', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id: Number(topicId), question: ftQuestion, user_answer: ftAnswer }),
      })
      if (!res.ok) throw new Error('Kunne ikke evaluere svar')
      const data = await res.json()
      setFtEval(data)
      setFtResultId(data.result_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setFtSubmitting(false)
    }
  }

  async function handleFtFlag() {
    if (!ftResultId || ftFlagged) return
    try {
      await authFetch(`/api/test-results/${ftResultId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged_by_user: true }),
      })
      setFtFlagged(true)
    } catch {}
  }

  function handleFtNext() {
    if (ftCount >= FT_TOTAL) {
      navigate(`/subjects/${subjectId}/topics`)
    } else {
      setFtCount(c => c + 1)
      loadFtQuestion()
    }
  }

  async function handleMcSelect(optionIndex) {
    if (selectedIndex !== null || mcSaving) return
    setMcSaving(true)
    setSelectedIndex(optionIndex)

    const score = optionIndex === questions[currentIndex].correct_index ? 1 : 0
    try {
      const res = await authFetch('/api/test-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id: Number(topicId), score, flagged_by_user: false }),
      })
      if (res.ok) setMcResultId((await res.json()).id)
    } catch {}

    setMcSaving(false)
  }

  async function handleMcFlag() {
    if (!mcResultId || mcFlagged) return
    try {
      await authFetch(`/api/test-results/${mcResultId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged_by_user: true }),
      })
      setMcFlagged(true)
    } catch {}
  }

  function handleMcNext() {
    if (currentIndex === questions.length - 1) {
      navigate(`/subjects/${subjectId}/topics`)
    } else {
      setCurrentIndex(i => i + 1)
      setSelectedIndex(null)
      setMcResultId(null)
      setMcFlagged(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  const topicHeader = (topicName || subjectName) && (
    <div className="mb-5">
      {subjectName && <p className="text-xs text-muted-foreground mb-0.5">{subjectName}</p>}
      {topicName && <h2 className="text-lg font-semibold">{topicName}</h2>}
    </div>
  )

  const modeToggle = (
    <div className="flex gap-1 bg-secondary rounded-lg p-1 mb-6">
      <button
        onClick={() => switchMode('mc')}
        className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${mode === 'mc' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        Flervalg
      </button>
      <button
        onClick={() => switchMode('freetext')}
        className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${mode === 'freetext' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        Fritekst
      </button>
    </div>
  )

  // MC mode
  if (mode === 'mc') {
    if (mcLoading) {
      return (
        <div className="min-h-screen p-6 max-w-2xl mx-auto">
          {topicHeader}
          {modeToggle}
          <div className="flex flex-col items-center gap-3 mt-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground text-sm">Genererer spørsmål...</p>
          </div>
        </div>
      )
    }

    const question = questions[currentIndex]
    const answered = selectedIndex !== null
    const isLast = currentIndex === questions.length - 1

    return (
      <div className="min-h-screen p-6 max-w-2xl mx-auto">
        {topicHeader}
        {modeToggle}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">Spørsmål {currentIndex + 1} av {questions.length}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMcFlag}
            disabled={!answered || mcFlagged}
            className={mcFlagged ? 'border-orange-300 bg-orange-50 text-orange-600 hover:bg-orange-50' : 'text-muted-foreground hover:border-orange-300 hover:text-orange-500'}
          >
            {mcFlagged ? 'Flagget' : 'Flagg spørsmål'}
          </Button>
        </div>

        <Card className="mb-4">
          <CardContent className="p-6">
            <p className="text-lg font-medium mb-6">{question.question}</p>
            <ul className="flex flex-col gap-3">
              {question.options.map((option, i) => (
                <li key={i}>
                  <button
                    onClick={() => handleMcSelect(i)}
                    disabled={answered}
                    className={`w-full text-left border-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${optionStyle(i, selectedIndex, question.correct_index)}`}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {answered && (
          <Card className="mb-4">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-foreground mb-1">Forklaring</p>
              <p className="text-sm text-muted-foreground">{question.explanation}</p>
            </CardContent>
          </Card>
        )}

        {answered && (
          <Button className="w-full" onClick={handleMcNext}>
            {isLast ? 'Gå tilbake til temaer' : 'Neste spørsmål'}
          </Button>
        )}
      </div>
    )
  }

  // Freetext mode
  const { text: scoreText, cls: scoreClass } = ftEval ? scoreLabel(ftEval.score) : {}

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      {topicHeader}
      {modeToggle}

      {ftLoading || !ftQuestion ? (
        <div className="flex flex-col items-center gap-3 mt-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Genererer spørsmål...</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-muted-foreground">Spørsmål {ftCount} av {FT_TOTAL}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFtFlag}
              disabled={!ftEval || ftFlagged}
              className={ftFlagged ? 'border-orange-300 bg-orange-50 text-orange-600 hover:bg-orange-50' : 'text-muted-foreground hover:border-orange-300 hover:text-orange-500'}
            >
              {ftFlagged ? 'Flagget' : 'Flagg spørsmål'}
            </Button>
          </div>

          <Card className="mb-4">
            <CardContent className="p-6">
              <p className="text-lg font-medium mb-4">{ftQuestion}</p>
              <textarea
                value={ftAnswer}
                onChange={e => setFtAnswer(e.target.value)}
                disabled={!!ftEval}
                placeholder="Skriv svaret ditt her..."
                rows={5}
                className="w-full border border-input bg-background rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:bg-secondary disabled:text-muted-foreground transition-colors"
              />
            </CardContent>
          </Card>

          {ftEval && (
            <div className={`rounded-xl border p-5 mb-4 ${scoreClass}`}>
              <p className="text-sm font-semibold mb-1">{scoreText}</p>
              <p className="text-sm">{ftEval.feedback}</p>
            </div>
          )}

          {!ftEval ? (
            <Button
              className="w-full"
              onClick={handleFtSubmit}
              disabled={!ftAnswer.trim() || ftSubmitting}
            >
              {ftSubmitting ? 'Evaluerer...' : 'Send inn svar'}
            </Button>
          ) : (
            <Button className="w-full" onClick={handleFtNext}>
              {ftCount >= FT_TOTAL ? 'Gå tilbake til temaer' : 'Neste spørsmål'}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
