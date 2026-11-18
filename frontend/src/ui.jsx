import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, Building, Building2, Cable, CircleCheck, EvCharger, Factory, File, FileText, Flame, Fuel, Gauge, HardHat, Hotel,
  House, Image, Landmark, Lightbulb, Package, PanelsTopLeft, PencilRuler, Search, ShieldCheck, Stamp, Thermometer, ToggleRight, Wrench, X, Zap,
} from 'lucide-react'
import { ACCENTS, MODES } from './theme.js'
import { reducedMotion, themeReveal } from './motion.js'
import { fold } from './format.js'
import { lang, setLang, t } from './i18n.js'

export const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

// Kategori simgesi ve rengi, adındaki anahtar kelimeye göre (sıra önemli: "pano termal" önce termal'e düşer).
// Stok kategorileri, iş aşamaları, kontrol türleri, belge türleri ve tesis türleri hepsi buradan.
// Kayıtlı adlar Türkçe ya da İngilizce olabilir; her anahtarın İngilizcesi yanında ("otel" Hotel'i, "apart" Apartments'ı da tutar).
const CAT_ICONS = [
  ['termal', Thermometer, 'pink'], ['thermal', Thermometer, 'pink'], ['jeneratör', Fuel, 'orange'], ['generator', Fuel, 'orange'],
  ['paratoner', Zap, 'yellow'], ['lightning', Zap, 'yellow'], ['kompanzasyon', Gauge, 'teal'], ['power factor', Gauge, 'teal'],
  ['yangın', Flame, 'red'], ['fire', Flame, 'red'], ['topraklama', ArrowDownToLine, 'green'], ['earthing', ArrowDownToLine, 'green'],
  ['koruma', ShieldCheck, 'blue'], ['protection', ShieldCheck, 'blue'], ['kablo', Cable, 'orange'], ['cable', Cable, 'orange'],
  ['aydınlatma', Lightbulb, 'yellow'], ['lighting', Lightbulb, 'yellow'], ['kumanda', ToggleRight, 'indigo'], ['control', ToggleRight, 'indigo'],
  ['tesisat', Wrench, 'gray'], ['wiring', Wrench, 'gray'], ['şarj', EvCharger, 'mint'], ['charging', EvCharger, 'mint'],
  ['pano', PanelsTopLeft, 'teal'], ['switchboard', PanelsTopLeft, 'teal'],
  ['keşif', Search, 'cyan'], ['survey', Search, 'cyan'], ['çizim', PencilRuler, 'blue'], ['drawing', PencilRuler, 'blue'],
  ['edaş', Stamp, 'purple'], ['approval', Stamp, 'purple'], ['uygulama', HardHat, 'brown'], ['installation', HardHat, 'brown'],
  ['tamamlandı', CircleCheck, 'green'], ['done', CircleCheck, 'green'],
  ['dwg', PencilRuler, 'blue'], ['pdf', FileText, 'red'], ['foto', Image, 'green'], ['dosya', File, 'gray'],
  ['otel', Hotel, 'indigo'], ['apart', Building, 'purple'], ['konut', House, 'teal'], ['residential', House, 'teal'],
  ['sanayi', Factory, 'brown'], ['industrial', Factory, 'brown'], ['kamu', Landmark, 'blue'], ['public', Landmark, 'blue'],
  ['diğer', Building2, 'gray'], ['other', Building2, 'gray'],
].map(([k, ...rest]) => [fold(k), ...rest])
const CAT_COLORS = ['blue', 'indigo', 'purple', 'pink', 'teal', 'cyan', 'mint', 'brown']
export function catStyle(name) {
  const key = fold(name || '').trim()
  const hit = CAT_ICONS.find(([k]) => key.includes(k))
  if (hit) return [hit[1], hit[2]]
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return [Package, CAT_COLORS[h % CAT_COLORS.length]]
}
export function CatIcon({ name, size = '' }) {
  const [Icon, color] = catStyle(name)
  return <span className={`sq c-${color} ${size}`} aria-hidden><Icon /></span>
}

// Kategori kutuları (Anımsatıcılar listeleri gibi). items: { key, label, count, alert, alertText, late }.
// Seçili kutuya tekrar basınca filtre kalkar.
export function CategoryTiles({ items, value, onPick, label }) {
  return (
    <div className="cats" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.key} type="button" className="cat" aria-pressed={String(value) === String(it.key)}
          onClick={() => onPick(String(value) === String(it.key) ? '' : String(it.key))}>
          <CatIcon name={it.icon ?? it.label} size="lg" />
          <span className="n">{it.count}</span>
          <span className="name">{it.label}{it.alert > 0 && <em className={it.late ? 'late' : ''}>{it.alert} {it.alertText}</em>}</span>
        </button>
      ))}
    </div>
  )
}

// Gruplu listede bölüm başlığı: renkli simge, ad, sağda özet.
export function SectionHead({ name, icon, children }) {
  return (
    <div className="section-head">
      <CatIcon name={icon ?? name} />
      <h2>{name}</h2>
      {children && <span>{children}</span>}
    </div>
  )
}

// Açık/koyu/sistem, vurgu rengi ve dil. Hem kenar çubuğundaki menüde hem telefonda "Diğer" sayfasında.
export function ThemeControls() {
  const { theme } = useApp()
  return (
    <div className="theme-ctl">
      <h3>{t('Görünüm')}</h3>
      <div className="seg" role="radiogroup" aria-label={t('Tema')}>
        {MODES.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={theme.mode === k} onClick={(e) => themeReveal(e, () => theme.setMode(k))}>{t(l)}</button>
        ))}
      </div>
      <h3>{t('Vurgu rengi')}</h3>
      <div className="swatches" role="radiogroup" aria-label={t('Vurgu rengi')}>
        {ACCENTS.map(([k, l]) => (
          <button key={k} type="button" role="radio" className={`sw-${k}`} aria-checked={theme.accent === k} aria-label={t(l)} title={t(l)}
            onClick={(e) => themeReveal(e, () => theme.setAccent(k))} />
        ))}
      </div>
      <h3>{t('Dil')}</h3>
      {/* Dil adları kendi dillerinde yazılır. Seçince sayfa yeniden yüklenir. */}
      <div className="seg" role="radiogroup" aria-label={t('Dil')}>
        {[['tr', 'Türkçe'], ['en', 'English']].map(([k, l]) => (
          <button key={k} type="button" role="radio" lang={k} aria-checked={lang === k} onClick={() => lang !== k && setLang(k)}>{l}</button>
        ))}
      </div>
    </div>
  )
}

// Formlar kaydedince paneli bununla kapatır; panel kapanış animasyonunu oynatıp sonra kapanır.
export const closePanel = (el) => el.closest('dialog')?.dispatchEvent(new Event('pano-close'))

// Sağdan (telefonda alttan) açılan panel. Yerel <dialog>: Esc ile kapanır, odak içeride kalır.
// Kapanırken iOS sayfası gibi geri kayar; animasyon bitince dialog gerçekten kapanır.
export function Panel({ title, sub, onClose, children }) {
  const ref = useRef(null)
  const [closing, setClosing] = useState(false)
  const close = () => {
    const d = ref.current
    if (!d?.open || d.dataset.closing) return
    if (reducedMotion()) { d.close(); return }
    d.dataset.closing = '1'
    setClosing(true)
    setTimeout(() => d.close(), 240)
  }
  useEffect(() => {
    const d = ref.current
    d.showModal()
    // showModal odağı kapat düğmesine verir; formda ilk alana, detayda panelin kendisine taşı.
    const first = d.querySelector('.panel-body input:not([type=hidden]):not([hidden]), .panel-body select')
    ;(first ?? d.querySelector('.panel-body')).focus({ preventScroll: true })
    d.addEventListener('pano-close', close)
    return () => d.removeEventListener('pano-close', close)
  }, [])
  return (
    <dialog ref={ref} className={`panel${closing ? ' closing' : ''}`} onClose={onClose}
      onCancel={(e) => { e.preventDefault(); close() }}
      onMouseDown={(e) => e.target === ref.current && close()}>
      <header className="panel-head">
        <div><h2>{title}</h2>{sub && <p className="muted">{sub}</p>}</div>
        <button type="button" className="icon-btn" onClick={close} aria-label={t('Kapat')}><X aria-hidden /></button>
      </header>
      <div className="panel-body" tabIndex={-1}>{children}</div>
    </dialog>
  )
}

// İş aşaması: tek hat üzerinde şalterler. Geçilen kapalı, şimdiki seçili, bekleyen açık.
export function StageLine({ steps, stepId, late, compact, onPick }) {
  const cur = steps.findIndex((s) => s.id === stepId)
  const finished = cur === steps.length - 1
  return (
    <div className={`hat${compact ? ' compact' : ''}${late ? ' trip' : ''}${finished ? ' finished' : ''}`}>
    <ol aria-label={t('Aşama: {name}', { name: steps[cur]?.name ?? '' })}>
      {steps.map((s, i) => {
        const cls = i < cur ? 'done' : i === cur ? 'cur' : ''
        const label = <span className={compact ? 'sr-only' : ''}>{s.name}</span>
        return (
          <li key={s.id} className={cls} title={compact ? s.name : undefined}>
            {onPick
              ? <button type="button" onClick={() => onPick(s.id)} aria-current={i === cur ? 'step' : undefined}
                  aria-label={compact ? t('{name} aşamasına al', { name: s.name }) : undefined}><i aria-hidden />{label}</button>
              : <><i aria-hidden />{label}</>}
          </li>
        )
      })}
    </ol>
    {compact && <span className="hat-name" aria-hidden>{steps[cur]?.name}</span>}
    </div>
  )
}

export function Field({ label, children, wide, hint }) {
  return <label className={`field${wide ? ' wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>
}

// Yükleme iskeleti: içerik gelene kadar liste şeklinde gri satırlar. Hızlı yüklemede hiç görünmez (gecikmeli belirir).
export function Loading({ error }) {
  if (error) return <p className="empty error">{error.message}</p>
  return <div className="skeleton" role="status" aria-label={t('Yükleniyor')}><i /><i /><i /><i /></div>
}

// Form gönderimi: hatayı gösterir, çift tıklamayı engeller.
export function useSubmit(fn) {
  const { notify } = useApp()
  const [busy, setBusy] = useState(false)
  const onSubmit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try { await fn(Object.fromEntries(new FormData(e.currentTarget)), e.currentTarget) }
    catch (err) { notify(err.message, true) }
    finally { setBusy(false) }
  }
  return [onSubmit, busy]
}

export const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(',', '.')))

// EAN-13 çizgileri (raf etiketi). 13 haneli değilse çizmez.
export function Ean13({ code }) {
  if (!/^\d{13}$/.test(code)) return <span className="mono">{code}</span>
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
  const R = L.map((x) => x.replace(/./g, (c) => (c === '0' ? '1' : '0')))
  const G = R.map((x) => [...x].reverse().join(''))
  const P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'][+code[0]]
  let bits = '101'
  for (let i = 1; i <= 6; i++) bits += (P[i - 1] === 'L' ? L : G)[+code[i]]
  bits += '01010'
  for (let i = 7; i <= 12; i++) bits += R[+code[i]]
  bits += '101'
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94])
  return (
    <svg viewBox="0 0 206 74" width="206" height="74" role="img" aria-label={t('Barkod {code}', { code })} className="ean">
      {[...bits].map((b, i) => b === '1' && <rect key={i} x={i * 2 + 8} y="2" width="2" height={guard.has(i) ? 58 : 52} />)}
      <text x="0" y="72">{code[0]}</text><text x="18" y="72">{code.slice(1, 7)}</text><text x="112" y="72">{code.slice(7)}</text>
    </svg>
  )
}
