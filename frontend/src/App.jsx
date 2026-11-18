import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Archive, Boxes, Building2, CalendarCheck, Camera, ClipboardList, Ellipsis, LayoutGrid, Palette, ScanBarcode } from 'lucide-react'
import { api, useApi } from './api.js'
import { useTheme } from './theme.js'
import { useSegmentedThumbs } from './motion.js'
import { AppCtx, ThemeControls } from './ui.jsx'
import { HareketPanel, MalzemeForm } from './pages/Hareket.jsx'
import { KameraOkut, canUseCamera } from './Kamera.jsx'
import { applyServerLang, t } from './i18n.js'

// Menü: Ayarlar uygulamasındaki gibi her öğenin kendi renkli ikon karesi var.
// Durum renkleri (kırmızı/turuncu/yeşil) menüde kullanılmaz, anlamları karışmasın.
const NAV = [
  { to: '/', label: 'Bugün', icon: LayoutGrid, color: 'indigo', end: true },
  { to: '/isler', label: 'İşler', icon: ClipboardList, color: 'blue', count: (d) => d.lateProjects, title: 'Geciken iş' },
  { to: '/stok', label: 'Stok', icon: Boxes, color: 'brown', count: (d) => d.criticalMaterials, warn: true, title: 'Kritik malzeme' },
  { to: '/kontroller', label: 'Kontroller', icon: CalendarCheck, color: 'teal', count: (d) => d.lateChecks, title: 'Geciken kontrol' },
  { to: '/arsiv', label: 'Arşiv', icon: Archive, color: 'gray' },
  { to: '/musteriler', label: 'Müşteriler', icon: Building2, color: 'purple' },
]

// Görünen barkod kutusuna odaklan (masaüstünde kenar çubuğunda, telefonda üstte).
const focusScan = () => [...document.querySelectorAll('.scan input')].find((i) => i.offsetParent)?.focus()

export default function App() {
  const [version, setVersion] = useState(0)
  const [toast, setToast] = useState(null)
  const [scan, setScan] = useState(null) // { material } veya { newCode }
  const [camera, setCamera] = useState(false)
  const settings = useApi('/settings')
  const dash = useApi('/dashboard', version)
  const theme = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useSegmentedThumbs()

  // Bildirim süresi dolunca önce kayarak çıkar (leaving), sonra kaldırılır.
  useEffect(() => {
    if (!toast) return
    if (toast.leaving) { const t = setTimeout(() => setToast(null), 220); return () => clearTimeout(t) }
    const t = setTimeout(() => setToast((x) => (x?.id === toast.id ? { ...x, leaving: true } : x)), toast.action ? 8000 : 3200) // geri alınabilir işlemde daha uzun
    return () => clearTimeout(t)
  }, [toast])

  // "/" tuşu her yerden barkod kutusuna götürür (USB okuyucu da klavye gibi yazar).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); focusScan()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ctx = useMemo(() => ({
    version, theme,
    steps: settings.data?.steps ?? [],
    customFields: settings.data?.settings.customFields ?? [],
    checkTypes: settings.data?.checkTypes ?? [],
    // action: { label, run } — bildirimde "Geri al" gibi bir düğme gösterir
    notify: (msg, err, action) => setToast({ msg, err, action, id: Date.now() }),
    changed: () => setVersion((v) => v + 1),
    openMovement: (material) => setScan({ material }),
  }), [version, settings.data, theme])

  // Barkod kutusu, USB okuyucu ve kamera aynı yoldan geçer: kayıtlıysa hareket paneli, değilse yeni malzeme.
  async function lookup(code) {
    try {
      setScan({ material: await api(`/materials/barcode/${encodeURIComponent(code)}`) })
    } catch {
      if (/^\d+$/.test(code)) setScan({ newCode: code })
      else navigate(`/stok?q=${encodeURIComponent(code)}`)
    }
  }

  function onScan(e) {
    e.preventDefault()
    const code = e.currentTarget.code.value.trim()
    if (!code) return
    e.currentTarget.reset()
    lookup(code)
  }

  const d = dash.data
  if (!settings.data) return <div className="boot">{settings.error ? t("API'ye ulaşılamadı: {msg}", { msg: settings.error.message }) : t('Pano açılıyor…')}</div>
  applyServerLang(settings.data.language)

  const scanForm = (id) => (
    <form className="scan" onSubmit={onScan} role="search">
      <label htmlFor={id} className="sr-only">{t('Barkod ile mal kabul ya da çıkış')}</label>
      <ScanBarcode aria-hidden />
      {/* Kenar çubuğu dar: kamera düğmesi ve kısayol yanında uzun metin kesiliyordu */}
      <input id={id} name="code" autoComplete="off" inputMode="search" placeholder={t(id === 'scan-side' ? 'Barkod okut' : 'Barkod okut ya da yaz')} />
      {canUseCamera() && (
        <button type="button" className="cam" onClick={() => setCamera(true)} aria-label={t('Kamerayla okut')} title={t('Kamerayla okut')}><Camera aria-hidden /></button>
      )}
      <kbd title={t('Kısayol')}>/</kbd>
    </form>
  )
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <div className="side-brand">
            <img src="/logo.svg" alt="" width="48" height="48" />
            <div><b>Pano</b><small>{t('İş ve stok takibi')}</small></div>
          </div>
          {scanForm('scan-side')}
          <nav className="side-nav" aria-label={t('Ana menü')}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} viewTransition>
                <span className={`sq c-${n.color}`}><n.icon aria-hidden /></span>
                <span className="lbl">{t(n.label)}</span>
                {n.count && d && n.count(d) > 0 && <b className={`badge${n.warn ? ' warn' : ''}`} title={t(n.title)}>{n.count(d)}</b>}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            <button type="button" popoverTarget="theme-pop">
              <span className="sq c-tint"><Palette aria-hidden /></span>{t('Görünüm')}
            </button>
          </div>
        </aside>
        <div className="main-col">
          <header className="mobile-top">{scanForm('scan-top')}</header>
          <main className="work"><Outlet /></main>
        </div>
        {/* Telefonda iOS sekme çubuğu: en fazla 5 sekme, Arşiv ve Müşteriler "Diğer" altında. */}
        <nav className="tabbar" aria-label={t('Sekmeler')}>
          {NAV.slice(0, 4).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} viewTransition>
              <n.icon aria-hidden />{t(n.label)}
              {n.count && d && n.count(d) > 0 && <b className={`badge${n.warn ? ' warn' : ''}`}>{n.count(d)}</b>}
            </NavLink>
          ))}
          <NavLink to="/diger" viewTransition className={['/arsiv', '/musteriler'].some((p) => pathname.startsWith(p)) ? 'active' : undefined}>
            <Ellipsis aria-hidden />{t('Diğer')}
          </NavLink>
        </nav>
      </div>
      <div id="theme-pop" popover="auto" className="popover"><ThemeControls /></div>
      {camera && <KameraOkut onClose={() => setCamera(false)} onCode={(code) => { setCamera(false); lookup(code) }} />}
      {scan?.material && <HareketPanel material={scan.material} onClose={() => { setScan(null); focusScan() }} />}
      {scan?.newCode && <MalzemeForm barcode={scan.newCode} onClose={() => setScan((s) => (s?.newCode ? null : s))}
        onSaved={(m) => setScan({ material: m })} />}
      {toast && (
        <div key={toast.id} role="status" className={`toast${toast.err ? ' err' : ''}${toast.leaving ? ' leaving' : ''}`}>
          {toast.msg}
          {toast.action && (
            <button type="button" onClick={() => { setToast(null); toast.action.run() }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </AppCtx.Provider>
  )
}
