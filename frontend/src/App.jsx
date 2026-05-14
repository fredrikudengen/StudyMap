import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardPage from './pages/DashboardPage'
import GraphPage from './pages/GraphPage'
import HomePage from './pages/HomePage'
import LandingPage from './pages/LandingPage'
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
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/subjects/new" element={<Protected><HomePage /></Protected>} />
        <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/subjects/:id/topics" element={<Protected><TopicsPage /></Protected>} />
        <Route path="/subjects/:id/graph" element={<Protected><GraphPage /></Protected>} />
        <Route path="/subjects/:subjectId/topic/:topicId/test" element={<Protected><TestPage /></Protected>} />
      </Routes>
    </BrowserRouter>
  )
}
