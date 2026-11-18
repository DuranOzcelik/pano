import { vtName, withTransition } from '../motion.js'
import { useState } from 'react'
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, useApi } from '../api.js'
import { fmtDateTime, fmtMoney, fmtMoney2, fmtNum, fmtPct, marginPct, trIncludes } from '../format.js'
import { ChevronRight } from 'lucide-react'
import { CatIcon, Ean13, Empty, Loading, Panel, useApp } from '../ui.jsx'
import { MalzemeForm } from './Hareket.jsx'
import { t } from '../i18n.js'

const TABS = [['', 'Malzemeler'], ['hareketler', 'Hareketler'], ['siparis', 'Sipariş önerisi']]

export default function Stok() {
  const { version } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = params.get('sekme') ?? ''
  const [creating, setCreating] = useState(false)
  const materials = useApi('/materials', version)
  const value = (materials.data ?? []).reduce((a, m) => a + m.quantity * m.unitPrice, 0)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('Stok')}</h1>
          <p className="muted">{materials.data ? t('{n} kalem · depo değeri {value}', { n: materials.data.length, value: fmtMoney(value) }) : '…'}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>{t('Yeni malzeme')}</button>
      </header>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k}
            onClick={() => setParams((p) => { k ? p.set('sekme', k) : p.delete('sekme'); return p }, { replace: true })}>{t(label)}</button>
        ))}
      </div>
      {tab === 'hareketler' ? <Hareketler /> : tab === 'siparis' ? <Siparis /> : <Malzemeler materials={materials} />}
      {creating && <MalzemeForm onClose={() => setCreating(false)} />}
      <Outlet />
    </div>
  )
}

// Malzemeler kategori kutularıyla (Anımsatıcılar'daki listeler gibi) seçilir; seçim yoksa liste kategoriye göre gruplu.
function Malzemeler({ materials }) {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [crit, setCrit] = useState(false)
  const cat = params.get('kategori') ?? ''
  if (!materials.data) return <Loading error={materials.error} />

  const noCat = t('Kategorisiz')
  const catOf = (m) => m.category || noCat
  const groups = [...materials.data.reduce((map, m) => map.set(catOf(m), [...(map.get(catOf(m)) ?? []), m]), new Map())]
    .sort(([a], [b]) => (a === noCat) - (b === noCat) || a.localeCompare(b, 'tr'))
  const pick = (c) => setParams((p) => { c && c !== cat ? p.set('kategori', c) : p.delete('kategori'); return p }, { replace: true, viewTransition: true })
  const match = (m) => (!crit || m.isCritical) && (!q || trIncludes(`${m.name} ${m.barcode} ${m.location ?? ''}`, q))
  const shown = groups.filter(([c]) => !cat || c === cat).map(([c, ms]) => [c, ms.filter(match)]).filter(([, ms]) => ms.length)

  return (
    <>
      <div className="cats" role="group" aria-label={t('Kategoriler')}>
        {groups.map(([c, ms]) => {
          const critical = ms.filter((m) => m.isCritical).length
          return (
            <button key={c} type="button" className="cat" aria-pressed={cat === c} onClick={() => pick(c)}>
              <CatIcon name={c} size="lg" />
              <span className="n">{ms.length}</span>
              <span className="name">{c}{critical > 0 && <em>{t('{n} kritik', { n: critical })}</em>}</span>
            </button>
          )
        })}
      </div>
      <div className="toolbar">
        <input type="search" className="grow" placeholder={t('Malzeme adı, barkod ya da raf')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Malzeme ara')} />
        {cat && <button type="button" className="btn sm" onClick={() => pick('')}>{t('Tüm kategoriler')}</button>}
        <label className="check"><input type="checkbox" role="switch" checked={crit} onChange={(e) => { const v = e.target.checked; withTransition(() => setCrit(v)) }} /> {t('Sadece kritik')}</label>
      </div>
      {shown.length === 0 ? <Empty>{t('Aramaya uyan malzeme yok.')}</Empty> : shown.map(([c, ms]) => (
        <section key={c} className="group" aria-label={c} style={{ viewTransitionName: vtName('stok', c) }}>
          <div className="section-head">
            <CatIcon name={c} />
            <h2>{c}</h2>
            <span>{t('{n} kalem', { n: ms.length })} · {fmtMoney(ms.reduce((a, m) => a + m.quantity * m.unitPrice, 0))}</span>
          </div>
          <div className="table-wrap">
            <table className="tbl stock rows">
              <colgroup><col /><col style={{ width: 60 }} /><col style={{ width: 108 }} /><col style={{ width: 56 }} /><col style={{ width: 96 }} /><col style={{ width: 56 }} /><col style={{ width: 100 }} /><col style={{ width: 96 }} /><col style={{ width: 60 }} /><col style={{ width: 104 }} /></colgroup>
              <thead><tr><th>{t('Malzeme')}</th><th>{t('Raf')}</th><th className="r">{t('Miktar')}</th><th className="r">{t('En az')}</th><th className="r" title={t('Tedarikçinin birim liste fiyatı')}>{t('Liste')}</th><th className="r" title={t('Toptan alım iskontosu')}>{t('İsk.')}</th><th className="r" title={t('Liste fiyatından iskonto düşülmüş birim alış')}>{t('Net alış')}</th><th className="r" title={t('Birim satış fiyatı')}>{t('Satış')}</th><th className="r">{t('Marj')}</th><th className="r">{t('Stok değeri')}</th></tr></thead>
              <tbody>
                {ms.map((m) => (
                  <tr key={m.id}>
                    <td><Link to={`/stok/${m.id}`}>{m.name}</Link></td>
                    <td className="mono sub raf" data-label={t('Raf')}>{m.location}</td>
                    <td className="sub only-m">{t('Alış')} {fmtMoney2(m.unitPrice)}{m.discountRate > 0 && ` (${t('{p} isk.', { p: fmtPct(m.discountRate) })})`} · {t('Satış')} {m.salePrice > 0 ? fmtMoney2(m.salePrice) : '—'}</td>
                    <td className={`r strong qty side span${m.isCritical ? ' crit' : ''}`}>
                      {fmtNum(m.quantity)} {m.unit}
                      {m.minQuantity > 0 && <span className="bar mini" aria-hidden><i style={{ width: `${Math.min(100, (m.quantity / m.minQuantity) * 100)}%` }} /></span>}
                    </td>
                    <td className="r muted hide-m">{fmtNum(m.minQuantity)}</td>
                    <td className="r muted hide-m">{fmtMoney2(m.listPrice)}</td>
                    <td className="r muted hide-m">{m.discountRate > 0 ? fmtPct(m.discountRate) : '—'}</td>
                    <td className="r hide-m">{fmtMoney2(m.unitPrice)}</td>
                    <td className="r hide-m">{m.salePrice > 0 ? fmtMoney2(m.salePrice) : '—'}</td>
                    <td className="r muted hide-m">{fmtPct(marginPct(m.salePrice, m.unitPrice))}</td>
                    <td className="r hide-m">{fmtMoney(m.quantity * m.unitPrice)}</td>
                    <td className="chev-cell" aria-hidden><ChevronRight /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}

function Hareketler() {
  const { version } = useApp()
  const [type, setType] = useState('')
  const r = useApi(`/movements?take=200${type ? `&type=${type}` : ''}`, version)
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="radiogroup" aria-label={t('Hareket türü')}>
          {[['', 'Tümü'], ['In', 'Girişler'], ['Out', 'Çıkışlar']].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)}>{t(l)}</button>
          ))}
        </div>
      </div>
      {!r.data ? <Loading error={r.error} /> : r.data.length === 0 ? <Empty>{t('Kayıt yok.')}</Empty> : <MovementTable rows={r.data} />}
    </>
  )
}

function MovementTable({ rows, hideMaterial }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>{t('Tarih')}</th><th className="r">{t('Miktar')}</th>{!hideMaterial && <th>{t('Malzeme')}</th>}<th>{t('İş / irsaliye')}</th><th className="r">{t('Birim fiyat')}</th><th className="r">{t('Tutar')}</th><th>{t('Not')}</th></tr></thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id}>
              <td className="muted">{fmtDateTime(h.createdAt)}</td>
              <td className={`r ${h.type === 'In' ? 'in' : 'out'}`}>{h.type === 'In' ? '+' : '−'}{fmtNum(h.quantity)} {h.unit}</td>
              {!hideMaterial && <td><Link to={`/stok/${h.materialId}`}>{h.materialName}</Link></td>}
              <td>{h.projectId ? <Link to={`/isler/${h.projectId}`}>{h.projectCode} · {h.customerName}</Link> : h.referenceNo || '—'}</td>
              <td className="r" title={h.listPrice != null ? t('Liste {list}, iskonto {d}', { list: fmtMoney2(h.listPrice), d: fmtPct(h.discountRate) }) : undefined}>
                {fmtMoney2(h.unitPrice)}{h.listPrice != null && h.discountRate > 0 && <small className="muted">{t('{p} isk.', { p: fmtPct(h.discountRate) })}</small>}
              </td>
              <td className="r">{fmtMoney(h.quantity * h.unitPrice)}</td>
              <td className="muted">{h.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Siparis() {
  const { version } = useApp()
  const d = useApi('/dashboard', version)
  if (!d.data) return <Loading error={d.error} />
  const s = d.data.seasonSuggestions
  return (
    <>
      <p className="note">{t('Son 90 günün çıkışları 60 güne oranlanır, 1,4 sezon katsayısıyla çarpılır, minimum stok eklenir ve mevcut stok düşülür. En yüksek tutarlı beş kalem.')}</p>
      {s.length === 0 ? <Empty>{t('Şu an sipariş önerisi yok.')}</Empty> : (
        <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('Malzeme')}</th><th className="r">{t('Stok')}</th><th className="r">{t('60 günlük ihtiyaç')}</th><th className="r">{t('Sipariş')}</th><th className="r">{t('Tutar')}</th></tr></thead>
          <tbody>
            {s.map((x) => (
              <tr key={x.id}><td><Link to={`/stok/${x.id}`}>{x.name}</Link></td><td className="r">{fmtNum(x.quantity)}</td><td className="r">{fmtNum(x.need)}</td>
                <td className="r strong">{fmtNum(x.order)} {x.unit}</td><td className="r">{fmtMoney(x.value)}</td></tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  )
}

export function MalzemeDetay() {
  const { id } = useParams()
  const { version, openMovement, notify, changed } = useApp()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const r = useApi(`/materials/${id}`, version)
  const close = () => navigate('/stok')
  if (!r.data) return r.error ? <Panel title={t('Malzeme')} onClose={close}><Loading error={r.error} /></Panel> : null
  const { material: m, movements, usedBy } = r.data
  if (editing) return <MalzemeForm material={m} onClose={() => setEditing(false)} />
  // Sadece hiç hareketi olmayan (yanlış açılmış) malzeme silinir; sunucu da aynı kuralı uygular.
  const remove = async () => {
    if (!confirm(t('{name} silinsin mi? Bu geri alınamaz.', { name: m.name }))) return
    try { await api(`/materials/${m.id}`, { method: 'DELETE' }); notify(t('{name} silindi', { name: m.name })); changed(); close() }
    catch (e) { notify(e.message, true) }
  }

  return (
    <Panel title={m.name} sub={`${m.category || t('Kategorisiz')} · ${t('Raf {loc}', { loc: m.location || '—' })}`} onClose={close}>
      <dl className="facts">
        <div><dt>{t('Mevcut')}</dt><dd className={m.isCritical ? 'late' : ''}>{fmtNum(m.quantity)} {m.unit}{m.isCritical && t(' · kritik')}</dd></div>
        <div><dt>{t('En az')}</dt><dd>{fmtNum(m.minQuantity)} {m.unit}</dd></div>
        <div><dt>{t('Liste fiyatı')}</dt><dd>{fmtMoney2(m.listPrice)}</dd></div>
        <div><dt>{t('İskonto')}</dt><dd>{fmtPct(m.discountRate)}</dd></div>
        <div><dt>{t('Net (iskontolu) alış')}</dt><dd>{fmtMoney2(m.unitPrice)}</dd></div>
        <div><dt>{t('Satış fiyatı')}</dt><dd>{m.salePrice > 0 ? fmtMoney2(m.salePrice) : '—'}</dd></div>
        <div><dt>{t('Kâr marjı')}</dt><dd>{fmtPct(marginPct(m.salePrice, m.unitPrice))}</dd></div>
        <div><dt>{t('Stok değeri (alış / satış)')}</dt><dd>{fmtMoney(m.quantity * m.unitPrice)} / {fmtMoney(m.quantity * m.salePrice)}</dd></div>
      </dl>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => openMovement(m)}>{t('Giriş / çıkış yap')}</button>
        <button type="button" className="btn" onClick={() => setEditing(true)}>{t('Düzenle')}</button>
        <button type="button" className="btn" onClick={() => printLabel(m)}>{t('Raf etiketi yazdır')}</button>
        {movements.length === 0 && <button type="button" className="btn danger" onClick={remove}>{t('Sil')}</button>}
      </div>
      <figure className="label" id={`label-${m.id}`}>
        <b>{m.name}</b>
        <small>{t('RAF')} {m.location || '—'} · {m.unit.toLocaleUpperCase('tr')}</small>
        <Ean13 code={m.barcode} />
      </figure>
      {usedBy.length > 0 && (
        <section>
          <h3 className="cap">{t('Kullanıldığı işler')}</h3>
          <table className="tbl"><tbody>
            {usedBy.map((u) => <tr key={u.projectId}><td><Link to={`/isler/${u.projectId}`}>{u.projectCode} · {u.projectName}</Link></td><td className="muted">{u.customerName}</td><td className="r">{fmtNum(u.quantity)} {m.unit}</td></tr>)}
          </tbody></table>
        </section>
      )}
      <section>
        <h3 className="cap">{t('Hareket geçmişi')}</h3>
        {movements.length === 0 ? <Empty>{t('Henüz hareket yok.')}</Empty> : <MovementTable rows={movements} hideMaterial />}
      </section>
    </Panel>
  )
}

// Etiketi ayrı bir pencerede yazdırır; tarayıcının yazdırma penceresi açılır.
function printLabel(m) {
  const svg = document.querySelector(`#label-${m.id}`)?.outerHTML
  const w = window.open('', '_blank', 'width=420,height=320')
  if (!w || !svg) return
  // Uygulamanın stillerini (ve yerel fontunu) yazdırma penceresine de taşı.
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('')
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${m.barcode}</title>${styles}<style>body{margin:8mm;background:#fff}.label{border:0;padding:0}</style>${svg}`)
  w.document.close()
  w.focus()
  w.print()
}
