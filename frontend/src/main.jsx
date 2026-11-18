import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom'
import '@fontsource-variable/inter/opsz.css' // Apple dışı cihazlarda SF Pro yerine; yerel, internetsiz çalışır
import './styles.css'
import App from './App.jsx'
import Bugun from './pages/Bugun.jsx'
import Isler, { IsDetay } from './pages/Isler.jsx'
import Stok, { MalzemeDetay } from './pages/Stok.jsx'
import Kontroller from './pages/Kontroller.jsx'
import Arsiv from './pages/Arsiv.jsx'
import Musteriler, { MusteriDetay } from './pages/Musteriler.jsx'
import Diger from './pages/Diger.jsx'

// Veri yönlendiricisi: sayfalar App kabuğunun içinde (<Outlet />) açılır. Sayfalar da veri rotası olmalı;
// App içinde ayrı <Routes> olursa oradaki Link ve setSearchParams görünüm geçişini (viewTransition) yok sayar.
const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<App />}>
    <Route path="/" element={<Bugun />} />
    <Route path="/isler" element={<Isler />}><Route path=":id" element={<IsDetay />} /></Route>
    <Route path="/stok" element={<Stok />}><Route path=":id" element={<MalzemeDetay />} /></Route>
    <Route path="/kontroller" element={<Kontroller />} />
    <Route path="/arsiv" element={<Arsiv />} />
    <Route path="/musteriler" element={<Musteriler />}><Route path=":id" element={<MusteriDetay />} /></Route>
    <Route path="/diger" element={<Diger />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>,
))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
