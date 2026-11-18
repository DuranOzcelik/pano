import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { vtName } from '../motion.js'
import { api, useApi } from '../api.js'
import { dueText, fmtDate, trIncludes } from '../format.js'
import { CategoryTiles, Empty, Field, Loading, Panel, SectionHead, useApp, useSubmit, closePanel } from '../ui.jsx'
import { KontrolForm } from './Kontroller.jsx'
import { lang, t } from '../i18n.js'

// Tesis türü kayıtta düz metin; liste arayüz dilinde önerilir, sıralama iki dilde de aynı.
const TYPES = { tr: ['Otel', 'Apart', 'Konut', 'Sanayi', 'Kamu', 'Diğer'], en: ['Hotel', 'Apartments', 'Residential', 'Industrial', 'Public', 'Other'] }
const typeRank = (x) => Math.max(TYPES.tr.indexOf(x), TYPES.en.indexOf(x))
const STATUS = { late: 'Dikkat', soon: 'Yaklaşan', active: 'İş sürüyor', ok: 'Sorun yok' }

export default function Musteriler() {
  const { version } = useApp()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const r = useApi('/customers', version)
  const [params, setParams] = useSearchParams()
  const type = params.get('tur') ?? ''
  const pick = (k) => setParams((p) => { k ? p.set('tur', k) : p.delete('tur'); return p }, { replace: true, viewTransition: true })
  // Tesis türüne göre kategoriler; kutuda dikkat isteyen (gecikme/yaklaşan) tesis sayısı.
  const byType = [...(r.data ?? []).reduce((m, c) => m.set(c.type, [...(m.get(c.type) ?? []), c]), new Map())]
    .sort(([a], [b]) => typeRank(a) - typeRank(b))
  const attn = (c) => c.status === 'late' || c.status === 'soon'
  const tiles = byType.map(([name, cs]) => ({ key: name, label: name, count: cs.length, alert: cs.filter(attn).length, alertText: t('dikkat'), late: cs.some((c) => c.status === 'late') }))
  const groups = byType.filter(([name]) => !type || name === type)
    .map(([name, cs]) => [name, cs.filter((c) => !q || trIncludes(`${c.name} ${c.region ?? ''} ${c.contact ?? ''}`, q))]).filter(([, cs]) => cs.length)
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{t('Müşteriler')}</h1><p className="muted">{r.data ? t('{n} tesis', { n: r.data.length }) : '…'}</p></div>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>{t('Yeni müşteri')}</button>
      </header>
      {r.data && tiles.length > 0 && <CategoryTiles label={t('Tesis türleri')} items={tiles} value={type} onPick={pick} />}
      <div className="toolbar">
        <input type="search" className="grow" placeholder={t('Tesis, bölge ya da kişi ara')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Müşteri ara')} />
        {type && <button type="button" className="btn sm" onClick={() => pick('')}>{t('Tüm türler')}</button>}
      </div>
      {!r.data ? <Loading error={r.error} /> : groups.length === 0 ? <Empty>{t('Kayıt yok.')}</Empty> : groups.map(([name, cs]) => (
        <section key={name} className="group" aria-label={name} style={{ viewTransitionName: vtName('mu', name) }}>
          <SectionHead name={name}>{t('{n} tesis', { n: cs.length })}</SectionHead>
          <div className="table-wrap">
            <table className="tbl rows fixed">
              <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: '22%' }} /><col style={{ width: 80 }} /><col style={{ width: '24%' }} /><col style={{ width: 110 }} /></colgroup>
              <thead><tr><th>{t('Tesis')}</th><th>{t('Bölge')}</th><th>{t('İletişim')}</th><th className="r">{t('Aktif iş')}</th><th>{t('Sıradaki kontrol')}</th><th className="r">{t('Durum')}</th></tr></thead>
              <tbody>
                {cs.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/musteriler/${c.id}`}>{c.name}</Link></td>
                    <td className="sub">{c.region}</td>
                    <td className="muted hide-m">{c.contact}</td>
                    <td className="r hide-m">{c.activeProjects || '—'}</td>
                    <td className="hide-m">{c.nextCheck ? <>{c.nextCheck.name} <span className="muted">· {fmtDate(c.nextCheck.nextDate)}</span></> : <span className="muted">—</span>}</td>
                    <td className={`r side span ${c.status}`}>{t(STATUS[c.status])}</td>
                    <td className="chev-cell" aria-hidden><ChevronRight /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {creating && <MusteriForm onClose={() => setCreating(false)} />}
      <Outlet />
    </div>
  )
}

function MusteriForm({ customer: c, onClose }) {
  const { notify, changed } = useApp()
  const navigate = useNavigate()
  const [onSubmit, busy] = useSubmit(async (f, form) => {
    const coord = (v) => (v ? Number(String(v).replace(',', '.')) : null)
    const body = { name: f.name, type: f.type, region: f.region, contact: f.contact, phone: f.phone, address: f.address, lat: coord(f.lat), lng: coord(f.lng) }
    const saved = await api(c ? `/customers/${c.id}` : '/customers', { method: c ? 'PUT' : 'POST', body })
    notify(t(c ? 'Müşteri güncellendi' : 'Müşteri eklendi'))
    changed()
    closePanel(form)
    if (!c) navigate(`/musteriler/${saved.id}`)
  })
  return (
    <Panel title={t(c ? 'Müşteriyi düzenle' : 'Yeni müşteri')} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <Field label={t('Tesis / firma adı')} wide><input name="name" required autoFocus defaultValue={c?.name} /></Field>
        <Field label={t('Tür')}><select name="type" defaultValue={c?.type ?? TYPES[lang][0]}>{[...new Set([...TYPES[lang], c?.type].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('Bölge')}><input name="region" defaultValue={c?.region} placeholder={t('Side, Sorgun, Kumköy…')} /></Field>
        <Field label={t('İletişim kişisi')}><input name="contact" defaultValue={c?.contact} placeholder={t('Teknik müdür · Ad')} /></Field>
        <Field label={t('Telefon')}><input name="phone" type="tel" defaultValue={c?.phone} /></Field>
        <Field label={t('Adres')} wide><input name="address" defaultValue={c?.address} /></Field>
        <Field label={t('Enlem')} hint={t('Harita için, isteğe bağlı')}><input name="lat" inputMode="decimal" defaultValue={c?.lat} placeholder="36.7712" /></Field>
        <Field label={t('Boylam')}><input name="lng" inputMode="decimal" defaultValue={c?.lng} placeholder="31.3925" /></Field>
        <div className="actions wide"><button type="submit" className="btn primary" disabled={busy}>{t('Kaydet')}</button></div>
      </form>
    </Panel>
  )
}

export function MusteriDetay() {
  const { id } = useParams()
  const { version, notify, changed } = useApp()
  const navigate = useNavigate()
  const [mode, setMode] = useState('')
  const customers = useApi('/customers', version)
  const projects = useApi('/projects', version)
  const checks = useApi('/checks', version)
  const close = () => navigate('/musteriler')
  const c = customers.data?.find((x) => x.id === Number(id))
  if (!customers.data || !projects.data || !checks.data) return null
  if (!c) return <Panel title={t('Müşteri')} onClose={close}><Empty>{t('Müşteri bulunamadı.')}</Empty></Panel>
  if (mode === 'edit') return <MusteriForm customer={c} onClose={() => setMode('')} />
  if (mode === 'check') return <KontrolForm customerId={c.id} onClose={() => setMode('')} />
  const ps = projects.data.filter((p) => p.customerId === c.id)
  const ks = checks.data.filter((k) => k.customerId === c.id)

  const remove = async () => {
    if (!confirm(t('{name} silinsin mi?', { name: c.name }))) return
    try { await api(`/customers/${c.id}`, { method: 'DELETE' }); notify(t('Müşteri silindi')); changed(); close() }
    catch (e) { notify(e.message, true) }
  }

  return (
    <Panel title={c.name} sub={`${c.type}${c.region ? ` · ${c.region}` : ''}`} onClose={close}>
      <dl className="facts">
        <div><dt>{t('İletişim')}</dt><dd>{c.contact || '—'}</dd></div>
        <div><dt>{t('Telefon')}</dt><dd>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</dd></div>
        <div className="wide"><dt>{t('Adres')}</dt><dd>{c.address || '—'}</dd></div>
      </dl>
      <div className="actions">
        <button type="button" className="btn" onClick={() => setMode('edit')}>{t('Düzenle')}</button>
        <button type="button" className="btn" onClick={() => setMode('check')}>{t('Kontrol ekle')}</button>
        {ps.length === 0 && ks.length === 0 && <button type="button" className="btn danger" onClick={remove}>{t('Sil')}</button>}
      </div>
      <section>
        <h3 className="cap">{t('İşler')}</h3>
        {ps.length === 0 ? <Empty>{t('İş kaydı yok.')}</Empty> : (
          <table className="tbl"><tbody>
            {ps.map((p) => <tr key={p.id}><td className="mono">{p.code}</td><td><Link to={`/isler/${p.id}`}>{p.name}</Link></td><td className="r muted">{p.completedAt ? t('tamamlandı') : dueText(p.dueDate)}</td></tr>)}
          </tbody></table>
        )}
      </section>
      <section>
        <h3 className="cap">{t('Periyodik kontroller')}</h3>
        {ks.length === 0 ? <Empty>{t('Tanımlı kontrol yok.')}</Empty> : (
          <table className="tbl"><tbody>
            {ks.map((k) => <tr key={k.id}><td>{k.checkType}</td><td className="muted">{fmtDate(k.nextDate)}</td><td className={`r ${k.status}`}>{dueText(k.nextDate)}</td></tr>)}
          </tbody></table>
        )}
      </section>
    </Panel>
  )
}
