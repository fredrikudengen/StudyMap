import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { authFetch } from '../api'

function optionStyle(index, selectedIndex, correctIndex) {
  if (selectedIndex === null) {
    return 'border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
  }
  if (index === correctIndex) return 'border-green-500 bg-green-50 text-green-800'
  if (index === selectedIndex) return 'border-red-400 bg-red-50 text-red-800'
  return 'border-gray-200 bg-white text-gray-400'
}

export default function TestPage() {
  const { subjectId, topicId } = useParams()
  const navigate = useNavigate()

  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [resultId, setResultId] = useState(null)
  const [flagged, setFlagged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadQuestions() {
      try {
        const res = await authFetch(`/api/topics/${topicId}/generate-question`, { method: 'POST' })
        if (!res.ok) throw new Error('Kunne ikke generere spørsmål')
        setQuestions(await res.json())
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadQuestions()
  }, [topicId])

  async function handleSelect(optionIndex) {
    if (selectedIndex !== null || saving) return
    setSaving(true)
    setSelectedIndex(optionIndex)

    const score = optionIndex === questions[currentIndex].correct_index ? 1 : 0
    try {
      const res = await authFetch('/api/test-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id: Number(topicId), score, flagged_by_user: false }),
      })
      if (res.ok) setResultId((await res.json()).id)
    } catch {}

    setSaving(false)
  }

  async function handleFlag() {
    if (!resultId || flagged) return
    try {
      await authFetch(`/api/test-results/${resultId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged_by_user: true }),
      })
      setFlagged(true)
    } catch {}
  }

  function handleNext() {
    if (currentIndex === questions.length - 1) {
      navigate(`/subjects/${subjectId}/topics`)
    } else {
      setCurrentIndex(i => i + 1)
      setSelectedIndex(null)
      setResultId(null)
      setFlagged(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Genererer spørsmål...</p>
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

  const question = questions[currentIndex]
  const answered = selectedIndex !== null
  const isLast = currentIndex === questions.length - 1

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-400">Spørsmål {currentIndex + 1} av {questions.length}</p>
        <button
          onClick={handleFlag}
          disabled={!answered || flagged}
          className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            flagged
              ? 'border-orange-300 bg-orange-50 text-orange-600'
              : 'border-gray-200 text-gray-400 hover:border-orange-300 hover:text-orange-500 disabled:opacity-30 disabled:cursor-not-allowed'
          }`}
        >
          {flagged ? 'Flagget' : 'Flagg spørsmål'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
        <p className="text-lg font-medium mb-6">{question.question}</p>

        <ul className="flex flex-col gap-3">
          {question.options.map((option, i) => (
            <li key={i}>
              <button
                onClick={() => handleSelect(i)}
                disabled={answered}
                className={`w-full text-left border-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${optionStyle(i, selectedIndex, question.correct_index)}`}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {answered && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-1">Forklaring</p>
          <p className="text-sm text-gray-600">{question.explanation}</p>
        </div>
      )}

      {answered && (
        <button
          onClick={handleNext}
          className="w-full bg-blue-600 text-white rounded-xl px-4 py-3 font-medium hover:bg-blue-700 transition-colors"
        >
          {isLast ? 'Gå tilbake til temaer' : 'Neste spørsmål'}
        </button>
      )}
    </div>
  )
}
