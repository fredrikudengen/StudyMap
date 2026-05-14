import { BrowserRouter, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import TestPage from './pages/TestPage'
import TopicsPage from './pages/TopicsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/subjects/:id/topics" element={<TopicsPage />} />
        <Route path="/subjects/:subjectId/topic/:topicId/test" element={<TestPage />} />
      </Routes>
    </BrowserRouter>
  )
}
