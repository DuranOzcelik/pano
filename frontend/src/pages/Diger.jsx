import { Link } from 'react-router-dom'
import { Archive, Building2, ChevronRight } from 'lucide-react'
import { ThemeControls } from '../ui.jsx'
import { t } from '../i18n.js'

// Telefonda sekme çubuğuna sığmayanlar ve görünüm ayarları (iOS "Diğer" sekmesi gibi).
export default function Diger() {
  return (
    <div className="page">
      <header className="page-head"><div><h1>{t('Diğer')}</h1></div></header>
      <nav className="list" aria-label={t('Diğer sayfalar')}>
        <Link to="/arsiv" viewTransition><span className="sq c-gray"><Archive aria-hidden /></span>{t('Arşiv')}<ChevronRight className="chev" aria-hidden /></Link>
        <Link to="/musteriler" viewTransition><span className="sq c-purple"><Building2 aria-hidden /></span>{t('Müşteriler')}<ChevronRight className="chev" aria-hidden /></Link>
      </nav>
      <div className="list-box"><ThemeControls /></div>
    </div>
  )
}
