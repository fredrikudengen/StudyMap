import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TestPage from './pages/TestPage'
import TopicsPage from './pages/TopicsPage'

function Protected({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Protected><HomePage /></Protected>} />
        <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/subjects/:id/topics" element={<Protected><TopicsPage /></Protected>} />
        <Route path="/subjects/:subjectId/topic/:topicId/test" element={<Protected><TestPage /></Protected>} />
      </Routes>
    </BrowserRouter>
  )
}
