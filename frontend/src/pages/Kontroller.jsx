import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { vtName } from '../motion.js'
import { api, useApi } from '../api.js'
import { dueText, fmtDate, isoToday, trIncludes } from '../format.js'
import { CategoryTiles, Empty, Field, Loading, Panel, SectionHead, useApp, useSubmit, closePanel } from '../ui.jsx'
import { t } from '../i18n.js'

const PERIODS = [[1, 'Aylık'], [3, '3 ayda bir'], [6, '6 ayda bir'], [12, 'Yıllık'], [24, '2 yılda bir']]

// Tesislerin periyodik kontrolleri. "Yapıldı" son tarihi bugüne çeker, geçmişe kayıt düşer.
export default function Kontroller() {
  const { version, notify, changed } = useApp()
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')
  const [params, setParams] = useSearchParams()
  const type = params.get('tur') ?? ''
  const pick = (k) => setParams((p) => { k ? p.set('tur', k) : p.delete('tur'); return p }, { replace: true, viewTransition: true })
  const r = useApi('/checks', version)

  const done = async (k) => {
    try {
      const res = await api(`/checks/${k.id}/done`, { method: 'POST', body: {} })
      changed()
      // Yasal kontrol tarihi tek tıkla değişiyor: yanlışlıkla basıldıysa önceki tarih geri gelsin.
      notify(t('{type} işaretlendi. Sonraki: {date}', { type: k.checkType, date: fmtDate(res.nextDate) }), false, {
        label: t('Geri al'),
        run: async () => {
          try { await api(`/checks/history/${res.historyId}/undo`, { method: 'POST' }); changed(); notify(t('Geri alındı')) }
          catch (e) { notify(e.message, true) }
        },
      })
    } catch (e) { notify(e.message, true) }
  }

  const all = r.data ?? []
  const count = (s) => all.filter((k) => k.status === s).length
  // Kontrol türüne göre kategoriler; kutuda gecikme varsa kırmızı, yoksa yaklaşan sayısı turuncu.
  const byType = [...all.reduce((m, k) => m.set(k.checkType, [...(m.get(k.checkType) ?? []), k]), new Map())]
    .sort(([a], [b]) => a.localeCompare(b, 'tr'))
  const tiles = byType.map(([name, ks]) => {
    const late = ks.filter((k) => k.status === 'late').length, soon = ks.filter((k) => k.status === 'soon').length
    return { key: name, label: name, count: ks.length, alert: late || soon, alertText: t(late ? 'gecikti' : 'yaklaşıyor'), late: late > 0 }
  })
  const groups = byType.filter(([name]) => !type || name === type)
    .map(([name, ks]) => [name, ks.filter((k) => !q || trIncludes(`${k.customerName} ${k.checkType}`, q))]).filter(([, ks]) => ks.length)
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('Kontroller')}</h1>
          <p className="muted">
            {r.data ? t('{late} gecikti · 30 gün içinde {soon} · {ok} planlı', { late: count('late'), soon: count('soon'), ok: count('ok') }) : '…'}
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>{t('Yeni kontrol')}</button>
      </header>
      {r.data && tiles.length > 0 && <CategoryTiles label={t('Kontrol türleri')} items={tiles} value={type} onPick={pick} />}
      <div className="toolbar">
        <input type="search" className="grow" placeholder={t('Tesis ya da kontrol türü ara')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Kontrol ara')} />
        {type && <button type="button" className="btn sm" onClick={() => pick('')}>{t('Tüm türler')}</button>}
      </div>
      {!r.data ? <Loading error={r.error} /> : all.length === 0 ? <Empty>{t('Tanımlı kontrol yok. Tesis bazında periyodik kontrolleri buradan ekleyin.')}</Empty>
        : groups.length === 0 ? <Empty>{t('Aramaya uyan kontrol yok.')}</Empty> : groups.map(([name, ks]) => (
        <section key={name} className="group" aria-label={name} style={{ viewTransitionName: vtName('kt', name) }}>
          <SectionHead name={name}>{t('{n} tesis', { n: ks.length })}</SectionHead>
          <div className="table-wrap">
            <table className="tbl rows fixed">
              <colgroup><col /><col style={{ width: 80 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 132 }} /></colgroup>
              <thead><tr><th>{t('Tesis')}</th><th className="r">{t('Periyot')}</th><th>{t('Son yapılan')}</th><th>{t('Sonraki')}</th><th className="r">{t('Durum')}</th><th /></tr></thead>
              <tbody>
                {ks.map((k) => (
                  <tr key={k.id}>
                    <td>{k.customerName}</td>
                    <td className="r muted hide-m">{t('{n} ay', { n: k.periodMonths })}</td>
                    <td className="muted hide-m">{fmtDate(k.lastDoneDate)}</td>
                    <td className="strong sub">{fmtDate(k.nextDate)}</td>
                    <td className={`r side ${k.status}`}>{dueText(k.nextDate)}</td>
                    <td className="r side-b"><button type="button" className="btn sm" onClick={() => done(k)}>{t('Bugün yapıldı')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="note">{t('Yasal periyotlar şirketteki mühendisle teyit edilmeli.')}</p>
      {creating && <KontrolForm onClose={() => setCreating(false)} />}
    </div>
  )
}

function KontrolForm({ onClose, customerId }) {
  const { notify, changed, checkTypes, version } = useApp()
  const customers = useApi('/customers', version)
  const [period, setPeriod] = useState(12)
  const [onSubmit, busy] = useSubmit(async (f, form) => {
    await api('/checks', { method: 'POST', body: { customerId: Number(f.customerId), checkType: f.checkType, periodMonths: Number(f.periodMonths), lastDoneDate: f.lastDoneDate } })
    notify(t('Kontrol eklendi'))
    changed()
    closePanel(form)
  })
  // Listeden bilinen bir tür seçilince varsayılan periyodu getir.
  const onType = (e) => { const ct = checkTypes.find((x) => x.name === e.target.value); if (ct) setPeriod(ct.defaultPeriodMonths) }
  return (
    <Panel title={t('Yeni periyodik kontrol')} onClose={onClose}>
      {!customers.data ? <Loading error={customers.error} /> : (
        <form className="form" onSubmit={onSubmit}>
          <Field label={t('Tesis')} wide>
            <select name="customerId" required defaultValue={customerId ?? ''}>
              <option value="" disabled>{t('Seçin')}</option>
              {customers.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t('Kontrol türü')} wide hint={t('Listede yoksa yazın; yeni tür olarak eklenir.')}>
            <input name="checkType" list="check-types" required onChange={onType} autoComplete="off" />
            <datalist id="check-types">{checkTypes.map((t) => <option key={t.id} value={t.name} />)}</datalist>
          </Field>
          <Field label={t('Periyot')}>
            <select name="periodMonths" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {PERIODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
          </Field>
          <Field label={t('Son yapıldığı tarih')}><input type="date" name="lastDoneDate" required max={isoToday()} defaultValue={isoToday()} /></Field>
          <div className="actions wide"><button type="submit" className="btn primary" disabled={busy}>{t('Ekle')}</button></div>
        </form>
      )}
    </Panel>
  )
}

export { KontrolForm }
