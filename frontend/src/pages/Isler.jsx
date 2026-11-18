import { useState } from 'react'
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { vtName } from '../motion.js'
import { api, useApi } from '../api.js'
import { daysFrom, dueText, fmtDate, fmtMoney, fmtNum, isoToday, trIncludes } from '../format.js'
import { CategoryTiles, Empty, Field, Loading, Panel, SectionHead, StageLine, useApp, useSubmit, closePanel } from '../ui.jsx'
import { Belgeler } from './Arsiv.jsx'
import { t } from '../i18n.js'

// İşler aşamaya göre kategorize: üstte aşama kutuları (iş sayısı, gecikme), altta aşama aşama gruplu liste.
// Satırdaki aşama çubuğuna tıklayınca iş o aşamaya geçer.
export default function Isler() {
  const { steps, version, notify, changed } = useApp()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const projects = useApi('/projects', version)
  const stage = params.get('asama') ?? ''
  const showDone = params.get('tamamlanan') === '1'
  const creating = params.get('yeni') === '1'

  // vt: filtre değişiminde gruplar yerlerine kayarak gelsin (görünüm geçişi)
  const set = (k, v, vt) => setParams((p) => { v ? p.set(k, v) : p.delete(k); return p }, { replace: true, viewTransition: !!vt })
  const move = async (p, stepId) => {
    try { await api(`/projects/${p.id}/step`, { method: 'PUT', body: { stepId } }); notify(`${p.code} → ${steps.find((s) => s.id === stepId).name}`); changed() }
    catch (e) { notify(e.message, true) }
  }

  const all = projects.data ?? []
  const lastStep = steps.at(-1)?.id
  const isLate = (p) => !p.completedAt && daysFrom(p.dueDate) < 0
  const tiles = steps.map((s) => {
    const ps = all.filter((p) => p.stepId === s.id)
    return { key: s.id, label: s.name, count: ps.length, alert: ps.filter(isLate).length, alertText: t('gecikmiş'), late: true }
  })
  const match = (p) => !q || trIncludes(`${p.code} ${p.name} ${p.customerName}`, q)
  const groups = steps
    .filter((s) => (stage ? String(s.id) === stage : s.id !== lastStep || showDone))
    .map((s) => [s, all.filter((p) => p.stepId === s.id && match(p)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))])
    .filter(([, ps]) => ps.length)

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{t('İşler')}</h1><p className="muted">{t('{n} iş sürüyor · {late} gecikmiş', { n: all.filter((p) => !p.completedAt).length, late: all.filter(isLate).length })}</p></div>
        <button type="button" className="btn primary" onClick={() => set('yeni', '1')}>{t('Yeni iş')}</button>
      </header>
      {projects.data && <CategoryTiles label={t('Aşamalar')} items={tiles} value={stage} onPick={(k) => set('asama', k, true)} />}
      <div className="toolbar">
        <input type="search" className="grow" placeholder={t('Kod, iş adı ya da müşteri ara')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('İş ara')} />
        {stage && <button type="button" className="btn sm" onClick={() => set('asama', '', true)}>{t('Tüm aşamalar')}</button>}
        {!stage && <label className="check"><input type="checkbox" role="switch" checked={showDone} onChange={(e) => set('tamamlanan', e.target.checked ? '1' : '', true)} /> {t('Tamamlananlar da')}</label>}
      </div>
      {!projects.data ? <Loading error={projects.error} /> : groups.length === 0 ? <Empty>{t('Bu filtreye uyan iş yok.')}</Empty> : groups.map(([s, ps]) => (
        <section key={s.id} className="group" aria-label={s.name} style={{ viewTransitionName: vtName('is', s.id) }}>
          <SectionHead name={s.name}>{t('{n} iş', { n: ps.length })}{ps.some(isLate) && t(' · {n} gecikmiş', { n: ps.filter(isLate).length })}</SectionHead>
          <div className="table-wrap">
            <table className="tbl stack fixed jobs">
              <colgroup><col className="c-code" /><col /><col className="c-cust" /><col className="c-stage" /><col className="c-due" /></colgroup>
              <thead><tr><th>{t('Kod')}</th><th>{t('İş')}</th><th>{t('Müşteri')}</th><th>{t('Aşama')}</th><th className="r">{t('Teslim')}</th></tr></thead>
              <tbody>
                {ps.map((p) => {
                  const late = isLate(p)
                  return (
                    <tr key={p.id}>
                      <td className="mono">{p.code}</td>
                      <td><Link to={`/isler/${p.id}`}>{p.name}</Link>{p.latestDrawingRev != null && <span className="rev">Rev{p.latestDrawingRev}</span>}</td>
                      <td className="muted">{p.customerName}</td>
                      <td><StageLine steps={steps} stepId={p.stepId} late={late} compact onPick={(id) => move(p, id)} /></td>
                      <td className={`r ${p.completedAt ? 'muted' : late ? 'late' : daysFrom(p.dueDate) <= 7 ? 'soon' : ''}`}>
                        {p.completedAt ? fmtDate(p.dueDate) : dueText(p.dueDate)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {creating && <IsForm onClose={() => set('yeni', '')} />}
      <Outlet />
    </div>
  )
}

function IsForm({ project: p, onClose }) {
  const { notify, changed, customFields, version } = useApp()
  const navigate = useNavigate()
  const customers = useApi('/customers', version)
  const [onSubmit, busy] = useSubmit(async (f, form) => {
    const extra = Object.fromEntries(customFields.map((c, i) => [c, f[`x${i}`] ?? '']))
    const body = { name: f.name, customerId: Number(f.customerId), startDate: f.startDate || null, dueDate: f.dueDate, extra }
    const saved = await api(p ? `/projects/${p.id}` : '/projects', { method: p ? 'PUT' : 'POST', body })
    notify(p ? t('İş güncellendi') : t('{code} açıldı', { code: saved.code }))
    changed()
    closePanel(form)
    if (!p) navigate(`/isler/${saved.id}`)
  })
  return (
    <Panel title={t(p ? 'İşi düzenle' : 'Yeni iş')} sub={p ? p.code : t('İş ilk aşamada açılır, kodu otomatik verilir.')} onClose={onClose}>
      {!customers.data ? <Loading error={customers.error} /> : customers.data.length === 0 ? (
        <Empty>{t('Önce bir müşteri ekleyin.')} <Link to="/musteriler">{t('Müşteriler')}</Link></Empty>
      ) : (
        <form className="form" onSubmit={onSubmit}>
          <Field label={t('İş adı')} wide><input name="name" required autoFocus defaultValue={p?.name} placeholder={t('Örn. Spa bölümü tesisat yenileme')} /></Field>
          <Field label={t('Müşteri / tesis')} wide>
            <select name="customerId" defaultValue={p?.customerId ?? ''} required>
              <option value="" disabled>{t('Seçin')}</option>
              {customers.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('Başlangıç')}><input type="date" name="startDate" defaultValue={p?.startDate ?? isoToday()} /></Field>
          <Field label={t('Teslim')}><input type="date" name="dueDate" required defaultValue={p?.dueDate} /></Field>
          {customFields.map((c, i) => <Field key={c} label={c}><input name={`x${i}`} defaultValue={p?.extra?.[c]} /></Field>)}
          <div className="actions wide"><button type="submit" className="btn primary" disabled={busy}>{t(p ? 'Kaydet' : 'İşi aç')}</button></div>
        </form>
      )}
    </Panel>
  )
}

export function IsDetay() {
  const { id } = useParams()
  const { steps, version, notify, changed } = useApp()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const r = useApi(`/projects/${id}`, version)
  const close = () => navigate('/isler')
  if (!r.data) return r.error ? <Panel title={t('İş')} onClose={close}><Loading error={r.error} /></Panel> : null
  const { project: p, customer: c, materials, cost, documents, checks } = r.data
  const used = materials.filter((m) => m.quantity !== 0) // tamamı iade edilen malzeme listede kalmasın
  const late = !p.completedAt && daysFrom(p.dueDate) < 0

  const move = async (stepId) => {
    try { await api(`/projects/${p.id}/step`, { method: 'PUT', body: { stepId } }); changed() }
    catch (e) { notify(e.message, true) }
  }
  const remove = async () => {
    if (!confirm(t('{name} silinsin mi? Bu geri alınamaz.', { name: p.code }))) return
    try { await api(`/projects/${p.id}`, { method: 'DELETE' }); notify(t('{name} silindi', { name: p.code })); changed(); close() }
    catch (e) { notify(e.message, true) }
  }

  if (editing) return <IsForm project={p} onClose={() => setEditing(false)} />
  return (
    <Panel title={p.name} sub={`${p.code} · ${c.name}`} onClose={close}>
      <StageLine steps={steps} stepId={p.stepId} late={late} onPick={move} />
      <dl className="facts">
        <div><dt>{t('Başlangıç')}</dt><dd>{fmtDate(p.startDate)}</dd></div>
        <div><dt>{t('Teslim')}</dt><dd>{fmtDate(p.dueDate)} {!p.completedAt && <span className={late ? 'late' : 'muted'}>· {dueText(p.dueDate)}</span>}</dd></div>
        <div><dt>{t('Bölge')}</dt><dd>{c.region || '—'}</dd></div>
        <div><dt>{t('İletişim')}</dt><dd>{c.contact || '—'}{c.phone && <> · <a href={`tel:${c.phone}`}>{c.phone}</a></>}</dd></div>
        {Object.entries(p.extra).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <div className="actions">
        <button type="button" className="btn" onClick={() => setEditing(true)}>{t('Düzenle')}</button>
        {materials.length === 0 && documents.length === 0 && <button type="button" className="btn danger" onClick={remove}>{t('Sil')}</button>}
      </div>

      <section>
        <h3 className="cap">{t('Kullanılan malzeme · maliyet {cost} · satış {revenue}', { cost: fmtMoney(cost), revenue: fmtMoney(r.data.revenue) })}</h3>
        {used.length === 0 ? <Empty>{t(materials.length === 0 ? 'Bu işe henüz malzeme çıkılmadı. Barkodu okutup "İşe çıkış" seçin.' : 'Çıkılan malzemenin tamamı depoya iade edildi.')}</Empty> : (
          <table className="tbl"><tbody>
            {used.map((m) => (
              <tr key={m.materialId}><td><Link to={`/stok/${m.materialId}`}>{m.name}</Link></td><td className="r">{fmtNum(m.quantity)} {m.unit}</td><td className="r muted" title={t('Maliyet')}>{fmtMoney(m.cost)}</td><td className="r" title={t('Satış')}>{fmtMoney(m.revenue)}</td></tr>
            ))}
          </tbody></table>
        )}
      </section>

      <Belgeler projectId={p.id} documents={documents} />

      {checks.length > 0 && (
        <section>
          <h3 className="cap">{t('Tesisin periyodik kontrolleri')}</h3>
          <table className="tbl"><tbody>
            {checks.map((k) => (
              <tr key={k.id}><td>{k.checkType}</td><td className="muted">{fmtDate(k.nextDate)}</td><td className={`r ${k.status}`}>{dueText(k.nextDate)}</td></tr>
            ))}
          </tbody></table>
        </section>
      )}
    </Panel>
  )
}
