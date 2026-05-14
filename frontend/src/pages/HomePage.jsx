import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../api'
import Navbar from '../components/Navbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function HomePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [examDate, setExamDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, exam_date: examDate || null }),
      })
      if (!res.ok) throw new Error('Kunne ikke opprette emne')
      const subject = await res.json()
      navigate(`/subjects/${subject.id}/topics`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center px-4">
        <Card className="w-full max-w-md shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Nytt emne</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Emnenavn</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="f.eks. Lineær algebra"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="examDate">
                  Eksamensdato{' '}
                  <span className="text-muted-foreground font-normal">(valgfritt)</span>
                </Label>
                <Input
                  id="examDate"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={loading || !name.trim()} className="mt-1">
                {loading ? 'Oppretter...' : 'Opprett'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
