import { Link } from 'react-router-dom'
import { ArrowLeftRight, CalendarDays, Hourglass, MapPin, Package, TriangleAlert, Workflow } from 'lucide-react'
import { useApi } from '../api.js'
import { daysFrom, fmtDateTime, fmtLongDate, fmtNum, fmtWeekday, isoToday } from '../format.js'
import { t } from '../i18n.js'
import { Empty, Loading, useApp } from '../ui.jsx'

const greet = (h) => t(h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar')
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Bugün ekranı bir bento: her kutu tek bir soruya cevap verir.
export default function Bugun() {
  const { steps, version } = useApp()
  const dash = useApi('/dashboard', version)
  const projects = useApi('/projects', version)
  const materials = useApi('/materials', version)
  const checks = useApi('/checks', version)
  const customers = useApi('/customers', version)
  const all = [dash, projects, materials, checks, customers]
  if (all.some((r) => !r.data)) return <div className="page"><Loading error={all.find((r) => r.error)?.error} /></div>

  const now = new Date()
  const active = projects.data.filter((p) => !p.completedAt)
  const lateJobs = active.filter((p) => daysFrom(p.dueDate) < 0)
  const lateChecks = checks.data.filter((k) => k.status === 'late')
  const late = [
    ...lateJobs.map((p) => ({ key: `p${p.id}`, to: `/isler/${p.id}`, title: `${p.code} ${p.name}`, sub: p.customerName, days: daysFrom(p.dueDate) })),
    ...lateChecks.map((k) => ({ key: `k${k.id}`, to: '/kontroller', title: k.checkType, sub: k.customerName, days: daysFrom(k.nextDate) })),
  ].sort((a, b) => a.days - b.days)
  // Geciken azsa koyu kutu boş kalmasın: yaklaşanlar (7 gün içinde teslim, 30 gün içinde kontrol) altta.
  const upcoming = [
    ...active.filter((p) => daysFrom(p.dueDate) >= 0 && daysFrom(p.dueDate) <= 7).map((p) => ({ key: `p${p.id}`, to: `/isler/${p.id}`, title: `${p.code} ${p.name}`, sub: p.customerName, days: daysFrom(p.dueDate) })),
    ...checks.data.filter((k) => k.status === 'soon').map((k) => ({ key: `k${k.id}`, to: '/kontroller', title: k.checkType, sub: k.customerName, days: daysFrom(k.nextDate) })),
  ].sort((a, b) => a.days - b.days).slice(0, Math.max(0, 3 - late.length))

  const approvalIds = new Set(steps.filter((s) => s.isApproval).map((s) => s.id))
  const waiting = active.filter((p) => approvalIds.has(p.stepId))
    .map((p) => ({ ...p, waitDays: Math.max(0, Math.floor((now - new Date(p.stepChangedAt)) / 864e5)) }))
    .sort((a, b) => b.waitDays - a.waitDays)

  const critical = materials.data.filter((m) => m.isCritical)
    .sort((a, b) => a.quantity / (a.minQuantity || 1) - b.quantity / (b.minQuantity || 1))

  // 7 günlük şerit: o güne düşen teslimler ve kontroller.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const iso = isoOf(d)
    return {
      iso, d,
      items: [
        ...active.filter((p) => p.dueDate === iso).map((p) => ({ key: `p${p.id}`, to: `/isler/${p.id}`, text: t('İş {code} teslim', { code: p.code.slice(-3) }), kind: 'job' })),
        ...checks.data.filter((k) => k.nextDate === iso).map((k) => ({ key: `k${k.id}`, to: '/kontroller', text: k.checkType.split(' ')[0], kind: 'check' })),
      ],
    }
  })

  const lastStep = steps.at(-1)?.id
  const flow = steps.map((s) => ({ ...s, count: projects.data.filter((p) => p.stepId === s.id).length, late: lateJobs.some((p) => p.stepId === s.id) }))
  const maxFlow = Math.max(1, ...flow.filter((f) => f.id !== lastStep).map((f) => f.count))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('Bugün')}</h1>
          <p className="muted">{greet(now.getHours())} · {fmtLongDate(now)} · {t('{n} iş sürüyor', { n: active.length })}</p>
        </div>
        <Link className="btn primary" to="/isler?yeni=1">{t('Yeni iş')}</Link>
      </header>

      <div className="bento">
        <section className={`tile hero${late.length === 0 ? ' calm' : ''}`} aria-labelledby="t-late">
          <h2 id="t-late" className="tile-h"><TriangleAlert aria-hidden />{t('Dikkat isteyen')}</h2>
          {late.length === 0 ? <p className="big calm">{t('Geciken yok')}</p> : (
            <>
              <p className="big">{t('{n} gecikme', { n: late.length })}</p>
              <ul className="hero-list">
                {late.slice(0, 3).map((x) => (
                  <li key={x.key}><Link to={x.to}>{x.title}</Link><span>{x.sub} · {t('{n} gün gecikti', { n: -x.days })}</span></li>
                ))}
              </ul>
            </>
          )}
          {upcoming.length > 0 && (
            <ul className="hero-list soon-list" aria-label={t('Yaklaşan')}>
              {upcoming.map((x) => (
                <li key={x.key}><Link to={x.to}>{x.title}</Link><span>{x.sub} · {x.days === 0 ? t('bugün') : t('{n} gün kaldı', { n: x.days })}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="tile" aria-labelledby="t-edas">
          <h2 id="t-edas" className="tile-h t-indigo"><Hourglass aria-hidden />{t('EDAŞ onayında')}</h2>
          <p className="big">{waiting.length}</p>
          {waiting.length > 0
            ? <p className="muted">{t('en eskisi')} <Link to={`/isler/${waiting[0].id}`}>{waiting[0].code}</Link>{t(', {n} gündür bekliyor', { n: waiting[0].waitDays })}</p>
            : <p className="muted">{t('Onay bekleyen iş yok')}</p>}
        </section>

        <Saha customers={customers.data} />

        <section className="tile wide" aria-labelledby="t-stock">
          <div className="tile-top"><h2 id="t-stock" className="tile-h t-orange"><Package aria-hidden />{t('Kritik stok · {n} kalem', { n: critical.length })}</h2><Link to="/stok?sekme=siparis" className="tile-link">{t('Sipariş önerisi')}</Link></div>
          {critical.length === 0 ? <Empty>{t('Tüm malzemeler en az seviyenin üstünde.')}</Empty> : (
            <ul className="bars">
              {critical.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <Link to={`/stok/${m.id}`}>{m.name}</Link>
                  <span className="bar" role="img" aria-label={t("En az seviyenin yüzde {p}'i", { p: Math.round((m.quantity / m.minQuantity) * 100) })}>
                    <i style={{ width: `${Math.min(100, (m.quantity / m.minQuantity) * 100)}%` }} />
                  </span>
                  <b>{fmtNum(m.quantity)} / {fmtNum(m.minQuantity)} {m.unit}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tile wide" aria-labelledby="t-week">
          <h2 id="t-week" className="tile-h t-red"><CalendarDays aria-hidden />{t('Bu hafta')}</h2>
          <ol className="week">
            {week.map((w) => (
              <li key={w.iso} className={w.iso === isoToday() ? 'today' : ''}>
                <b>{fmtWeekday(w.d)}<span>{w.d.getDate()}</span></b>
                {w.items.map((x) => <Link key={x.key} to={x.to} className={`ev ${x.kind}`}>{x.text}</Link>)}
              </li>
            ))}
          </ol>
        </section>

        <section className="tile wide" aria-labelledby="t-mov">
          <div className="tile-top"><h2 id="t-mov" className="tile-h t-tint"><ArrowLeftRight aria-hidden />{t('Son hareketler')}</h2><Link to="/stok?sekme=hareketler" className="tile-link">{t('Tümü')}</Link></div>
          {dash.data.recentMovements.length === 0 ? <Empty>{t('Henüz hareket yok.')}</Empty> : (
            <ul className="ledger">
              {dash.data.recentMovements.slice(0, 5).map((h) => (
                <li key={h.id}>
                  <Link to={`/stok/${h.materialId}`}>{h.materialName}</Link>
                  <span className="muted">{h.projectCode ? `→ ${h.projectCode}` : h.referenceNo || fmtDateTime(h.createdAt)}</span>
                  <b className={h.type === 'In' ? 'in' : 'out'}>{h.type === 'In' ? '+' : '−'}{fmtNum(h.quantity)} {h.unit}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tile wide" aria-labelledby="t-flow">
          <div className="tile-top"><h2 id="t-flow" className="tile-h t-tint"><Workflow aria-hidden />{t('İş akışı')}</h2><Link to="/isler" className="tile-link">{t('İşler')}</Link></div>
          <ul className="flow">
            {flow.map((f) => (
              <li key={f.id} className={f.late ? 'late-row' : f.id === lastStep ? 'done-row' : ''}>
                <Link to={`/isler?asama=${f.id}`}>{f.name}</Link>
                <span className="bar"><i style={{ width: `${f.id === lastStep ? 100 : (f.count / maxFlow) * 100}%` }} /></span>
                <b>{f.count}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

// Örnek veri bölgesinin kıyı çizgisi (yaklaşık, batıdan doğuya). Tesislerle aynı enlem/boylam dönüşümüyle çizilir,
// böylece deniz gerçekten tesislerin güneyinde kalır. shortcut: elle girilmiş kaba çizgi, Leaflet haritası gelince kalkar.
const COAST = [[31.10, 36.825], [31.21, 36.802], [31.32, 36.783], [31.36, 36.771], [31.385, 36.760], [31.40, 36.768],
  [31.43, 36.765], [31.455, 36.756], [31.48, 36.742], [31.53, 36.736], [31.60, 36.722], [31.70, 36.700]]
// Bölge çerçevesi: tesisler bunun dışına taşarsa çerçeve genişler.
const REGION = { minLo: 31.18, maxLo: 31.58, minLa: 36.72, maxLa: 36.93 }
const LEGEND = [['late', 'Gecikme'], ['soon', 'Yaklaşan'], ['active', 'İş var'], ['ok', 'Sorun yok']]

function Saha({ customers }) {
  const pts = customers.filter((c) => c.lat != null && c.lng != null)
  const minLo = Math.min(REGION.minLo, ...pts.map((c) => c.lng)), maxLo = Math.max(REGION.maxLo, ...pts.map((c) => c.lng))
  const minLa = Math.min(REGION.minLa, ...pts.map((c) => c.lat)), maxLa = Math.max(REGION.maxLa, ...pts.map((c) => c.lat))
  const x = (lng) => 6 + ((lng - minLo) / (maxLo - minLo)) * 88
  const y = (lat) => 16 + (1 - (lat - minLa) / (maxLa - minLa)) * 50
  const sea = `${COAST.map(([lo, la]) => `${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join(' ')} 100,100 0,100`
  const attention = customers.filter((c) => c.status === 'late' || c.status === 'soon').length
  return (
    <Link to="/musteriler" className="tile saha" aria-label={t('Saha: {n} tesis, {a} tanesi dikkat istiyor', { n: customers.length, a: attention })}>
      <svg className="saha-map" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polygon points={sea} />
      </svg>
      <h2 className="tile-h t-green"><MapPin aria-hidden />{t('Saha')}</h2>
      <span className="muted">{t('{n} tesis dikkat istiyor', { n: attention })}</span>
      {pts.map((c, i) => <i key={c.id} className={`dot ${c.status}`} style={{ left: `${x(c.lng)}%`, top: `${y(c.lat)}%`, '--i': i }} title={`${c.name} · ${c.region ?? ''}`} />)}
      <ul className="legend" aria-hidden>
        {LEGEND.map(([k, l]) => <li key={k}><i className={`dot ${k}`} />{t(l)}</li>)}
      </ul>
    </Link>
  )
}
