import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { vtName, withTransition } from '../motion.js'
import { api, useApi } from '../api.js'
import { fmtDate, trIncludes } from '../format.js'
import { CategoryTiles, Empty, Loading, useApp } from '../ui.jsx'
import { t } from '../i18n.js'

const KIND = { DWG: 'DWG', PDF: 'PDF', FOTO: 'Foto', DIGER: 'Dosya' }
const size = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

// Bir işin belgeleri ve yükleme. Aynı adla yüklenen dosya yeni revizyon olur.
export function Belgeler({ projectId, documents }) {
  const { notify, changed } = useApp()
  const [showOld, setShowOld] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  const upload = async (files) => {
    if (!files.length) return
    const form = new FormData()
    for (const f of files) form.append('files', f)
    setBusy(true)
    try {
      const added = await api(`/projects/${projectId}/documents`, { method: 'POST', form })
      notify(added.length === 1 ? t('{doc} arşive eklendi', { doc: `${added[0].name} · Rev${added[0].revision}` }) : t('{n} belge arşive eklendi', { n: added.length }))
      changed()
    } catch (e) { notify(e.message, true) }
    finally { setBusy(false); input.current.value = '' }
  }
  const rows = documents.filter((d) => showOld || d.isLatest)
  const oldCount = documents.length - documents.filter((d) => d.isLatest).length
  return (
    <section>
      <h3 className="cap">{t('Çizimler ve belgeler')}</h3>
      <DocTable rows={rows} />
      {documents.length === 0 && <Empty>{t('Arşivde belge yok.')}</Empty>}
      <div className="actions">
        <label className={`btn${busy ? ' disabled' : ''}`}>
          {t(busy ? 'Yükleniyor…' : 'Belge yükle')}
          <input ref={input} type="file" multiple hidden disabled={busy} onChange={(e) => upload([...e.target.files])}
            accept=".dwg,.dxf,.pdf,.jpg,.jpeg,.png,.heic,.webp,.xlsx,.docx" />
        </label>
        {oldCount > 0 && <button type="button" className="btn link" onClick={() => setShowOld(!showOld)}>{showOld ? t('Eski revizyonları gizle') : t('{n} eski revizyon', { n: oldCount })}</button>}
      </div>
    </section>
  )
}

function DocTable({ rows }) {
  const { notify, changed } = useApp()
  if (rows.length === 0) return null
  // Yanlış yüklenen dosya için; sadece son revizyon silinir, dosya arşivde _silinenler klasörüne taşınır.
  const remove = async (d) => {
    if (!confirm(t('{doc} silinsin mi? Dosya arşivdeki _silinenler klasörüne taşınır.', { doc: `${d.name} · Rev${d.revision}` }))) return
    try { await api(`/documents/${d.id}`, { method: 'DELETE' }); notify(t('{name} silindi', { name: `${d.name} · Rev${d.revision}` })); changed() }
    catch (e) { notify(e.message, true) }
  }
  return (
    <table className="tbl docs">
      <tbody>
        {rows.map((d) => (
          <tr key={d.id} className={d.isLatest ? '' : 'old'}>
            <td className={`kind ${d.kind}`}>{t(KIND[d.kind])}</td>
            <td><a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer">{d.name}</a></td>
            <td className="mono">Rev{d.revision}</td>
            <td className="muted">{fmtDate(d.createdAt)}</td>
            <td className="r muted">{size(d.sizeBytes)}</td>
            <td className="r">
              <a href={`/api/documents/${d.id}/file?download=true`} className="dl">{t('İndir')}</a>
              {d.isLatest && <button type="button" className="del" onClick={() => remove(d)}>{t('Sil')}</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Arsiv() {
  const { version } = useApp()
  const r = useApi('/documents', version)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [showOld, setShowOld] = useState(false)
  const tiles = Object.entries(KIND).map(([k, l]) => {
    const ds = (r.data ?? []).filter((d) => d.kind === k && (showOld || d.isLatest))
    return { key: k, label: t(l), icon: l === 'Dosya' ? 'dosya' : l, count: ds.length }
  }).filter((t) => t.count > 0)
  const docs = (r.data ?? []).filter((d) => (showOld || d.isLatest) && (!kind || d.kind === kind) &&
    (!q || trIncludes(`${d.name} ${d.projectCode} ${d.projectName} ${d.customerName}`, q)))
  const groups = [...docs.reduce((m, d) => m.set(d.projectId, [...(m.get(d.projectId) ?? []), d]), new Map()).values()]

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{t('Arşiv')}</h1><p className="muted">{t('Çizim, onay yazısı, ölçüm raporu ve saha fotoğrafları işe bağlı. Yüklemek için işi açın.')}</p></div>
      </header>
      {tiles.length > 0 && <CategoryTiles label={t('Belge türleri')} items={tiles} value={kind} onPick={(k) => withTransition(() => setKind(k))} />}
      <div className="toolbar">
        <input type="search" className="grow" placeholder={t('Belge, iş ya da müşteri ara')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Belge ara')} />
        {kind && <button type="button" className="btn sm" onClick={() => withTransition(() => setKind(''))}>{t('Tüm türler')}</button>}
        <label className="check"><input type="checkbox" role="switch" checked={showOld} onChange={(e) => { const v = e.target.checked; withTransition(() => setShowOld(v)) }} /> {t('Eski revizyonlar')}</label>
      </div>
      {!r.data ? <Loading error={r.error} /> : groups.length === 0 ? (
        <section className="tile empty-tile">
          <h2>{t(r.data.length === 0 ? 'Arşiv henüz boş' : 'Aramaya uyan belge yok')}</h2>
          <p className="muted">{t('Çizimler, EDAŞ yazıları ve saha fotoğrafları işe bağlı tutulur. Bir işi açıp “Belge yükle” ile ekleyin; aynı adla yüklenen dosya yeni revizyon olur.')}</p>
          <Link className="btn" to="/isler">{t('İşlere git')}</Link>
        </section>
      ) : (
        groups.map((g) => (
          <section key={g[0].projectId} className="group" style={{ viewTransitionName: vtName('ar', g[0].projectId) }}>
            <h2 className="group-head"><Link to={`/isler/${g[0].projectId}`}><span className="mono">{g[0].projectCode}</span> {g[0].projectName}</Link> <span className="muted">· {g[0].customerName}</span></h2>
            <DocTable rows={g} />
          </section>
        ))
      )}
    </div>
  )
}
