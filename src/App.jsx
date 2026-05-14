import { Routes, Route } from 'react-router-dom'
import ReceptionistPage from './pages/ReceptionistPage'
import PatientStatusPage from './pages/PatientStatusPage'
import DisplayPage from './pages/DisplayPage'
import DoctorPage from './pages/DoctorPage'

export default function App() {
  return (
    <Routes>
      <Route path="/receptionist/:clinicId" element={<ReceptionistPage />} />
      <Route path="/receptionist" element={<ReceptionistPage />} />
      <Route path="/status/:token" element={<PatientStatusPage />} />
      <Route path="/display/:clinicId" element={<DisplayPage />} />
      <Route path="/doctor/:clinicId" element={<DoctorPage />} />
      <Route path="/doctor" element={<DoctorPage />} />
    </Routes>
  )
}
