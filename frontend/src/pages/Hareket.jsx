import { useState } from 'react'
import { api, useApi } from '../api.js'
import { fmtMoney2, fmtNum, fmtPct, marginPct, netPrice } from '../format.js'
import { Field, Panel, num, useApp, useSubmit, closePanel } from '../ui.jsx'
import { lang, t } from '../i18n.js'

// Birim kayıtta düz metin; liste arayüz dilinde önerilir, kayıttaki birim listede yoksa o da eklenir.
const UNITS = { tr: ['adet', 'm', 'kg', 'top', 'paket'], en: ['pcs', 'm', 'kg', 'roll', 'pack'] }

// Barkod okutunca açılan panel: giriş (irsaliye ve alış fiyatıyla) ya da bir işe çıkış.
export function HareketPanel({ material: m, onClose }) {
  const { notify, changed, version } = useApp()
  const [type, setType] = useState('In')
  const [qty, setQty] = useState('1')
  const [list, setList] = useState(String(m.listPrice ?? m.unitPrice ?? 0))
  const [discount, setDiscount] = useState(String(m.discountRate ?? 0))
  const projects = useApi('/projects', version)
  const active = (projects.data ?? []).filter((p) => !p.completedAt)
  const net = netPrice(num(list), num(discount))

  const [onSubmit, busy] = useSubmit(async (f, form) => {
    const q = num(qty)
    if (!(q > 0)) throw new Error(t('Miktar sıfırdan büyük olmalı.'))
    const body = { materialId: m.id, type, quantity: q, projectId: f.projectId ? Number(f.projectId) : null, referenceNo: f.referenceNo || null, note: f.note || null }
    if (type === 'In') Object.assign(body, { listPrice: num(list), discountRate: num(discount) })
    const r = await api('/movements', { method: 'POST', body })
    notify(t(type === 'In' ? 'Giriş kaydedildi. Stok: {q}' : 'Çıkış kaydedildi. Stok: {q}', { q: `${fmtNum(r.quantity)} ${m.unit}` }))
    changed()
    closePanel(form)
  })

  const q = num(qty)
  return (
    <Panel title={m.name} sub={`${m.barcode} · ${t('Raf {loc}', { loc: m.location || '—' })} · ${t('stokta {q}', { q: `${fmtNum(m.quantity)} ${m.unit}` })}`} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <div className="seg wide" role="radiogroup" aria-label={t('Hareket türü')}>
          <button type="button" role="radio" aria-checked={type === 'In'} onClick={() => setType('In')}>{t('Mal kabul (giriş)')}</button>
          <button type="button" role="radio" aria-checked={type === 'Out'} onClick={() => setType('Out')}>{t('İşe çıkış')}</button>
        </div>
        <Field label={t('Miktar ({unit})', { unit: m.unit })}>
          <input name="quantity" inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        {type === 'In' ? (
          <>
            <Field label={t('İrsaliye / fatura no')}><input name="referenceNo" placeholder={t('İRS-2026-…')} /></Field>
            <Field label={t('Liste fiyatı (₺)')} hint={t('Tedarikçinin birim fiyatı')}><input name="listPrice" inputMode="decimal" value={list} onChange={(e) => setList(e.target.value)} /></Field>
            <Field label={t('İskonto (%)')} hint={t('Toptan alım indirimi')}><input name="discountRate" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
            <dl className="calc wide">
              <div><dt>{t('Net (iskontolu) birim fiyat')}</dt><dd>{fmtMoney2(net)}</dd></div>
              <div className="total"><dt>{t('Toplam alış')}</dt><dd>{fmtMoney2(net * q)}</dd></div>
            </dl>
          </>
        ) : (
          <>
            <Field label={t('İş')}>
              <select name="projectId" required defaultValue="">
                <option value="" disabled>{t('İş seçin')}</option>
                {active.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </select>
            </Field>
            <dl className="calc wide">
              <div><dt>{t('İşe yazılacak maliyet')}</dt><dd>{fmtMoney2(m.unitPrice * q)}</dd></div>
              <div><dt>{t('Satış tutarı')}</dt><dd>{fmtMoney2(m.salePrice * q)}</dd></div>
            </dl>
          </>
        )}
        <Field label={t('Not')} wide><input name="note" placeholder={t('İsteğe bağlı')} /></Field>
        <div className="actions wide">
          <button type="submit" className="btn primary" disabled={busy}>{t(type === 'In' ? 'Girişi kaydet' : 'Çıkışı kaydet')}</button>
        </div>
      </form>
    </Panel>
  )
}

// Yeni malzeme ve düzenleme. Barkod boşsa sunucu iç kod üretir. Miktar sadece ilk kayıtta girilir.
// Fiyat: liste fiyatı + iskonto → net alış (maliyet); satış fiyatı ayrı, kâr marjı canlı hesaplanır.
export function MalzemeForm({ material: m, barcode = '', onClose, onSaved }) {
  const { notify, changed, version } = useApp()
  const all = useApi('/materials', version)
  const cats = [...new Set((all.data ?? []).map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))
  const [list, setList] = useState(String(m?.listPrice ?? 0))
  const [discount, setDiscount] = useState(String(m?.discountRate ?? 0))
  const [sale, setSale] = useState(String(m?.salePrice ?? 0))
  const net = netPrice(num(list), num(discount))

  const [onSubmit, busy] = useSubmit(async (f, form) => {
    const body = {
      name: f.name, category: f.category, unit: f.unit, location: f.location, barcode: f.barcode,
      minQuantity: num(f.minQuantity), initialQuantity: num(f.initialQuantity),
      listPrice: num(list), discountRate: num(discount), salePrice: num(sale),
    }
    const saved = await api(m ? `/materials/${m.id}` : '/materials', { method: m ? 'PUT' : 'POST', body })
    notify(m ? t('Malzeme güncellendi') : t('Malzeme eklendi: {code}', { code: saved.barcode }))
    changed()
    closePanel(form)
    onSaved?.(saved)
  })
  return (
    <Panel title={t(m ? 'Malzemeyi düzenle' : 'Yeni malzeme')} sub={m ? m.barcode : t('Barkod boş kalırsa sistem bir raf kodu üretir.')} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <Field label={t('Malzeme adı')} wide><input name="name" required defaultValue={m?.name} autoFocus placeholder={t('Örn. Otomatik sigorta C25 1P')} /></Field>
        {/* Var olan kategoriler önerilir; yazım farkı yüzünden aynı kategori ikiye bölünmesin. */}
        <Field label={t('Kategori')} hint={t('Listeden seçin ya da yeni kategori yazın')}>
          <input name="category" list="category-list" defaultValue={m?.category} placeholder={t('Koruma, Kablo…')} autoComplete="off" />
          <datalist id="category-list">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label={t('Birim')}>
          <select name="unit" defaultValue={m?.unit ?? UNITS[lang][0]}>{[...new Set([...UNITS[lang], m?.unit].filter(Boolean))].map((u) => <option key={u}>{u}</option>)}</select>
        </Field>
        {!m && <Field label={t('Başlangıç miktarı')}><input name="initialQuantity" inputMode="decimal" defaultValue="0" /></Field>}
        <Field label={t('Minimum seviye')}><input name="minQuantity" inputMode="decimal" defaultValue={m?.minQuantity ?? 0} /></Field>
        <Field label={t('Raf')}><input name="location" defaultValue={m?.location} placeholder="A-01" /></Field>
        <Field label={t('Liste fiyatı (₺)')} hint={t('Tedarikçinin birim fiyatı')}><input name="listPrice" inputMode="decimal" value={list} onChange={(e) => setList(e.target.value)} /></Field>
        <Field label={t('İskonto (%)')} hint={t('Toptan alım indirimi')}><input name="discountRate" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
        <Field label={t('Satış fiyatı (₺)')} wide><input name="salePrice" inputMode="decimal" value={sale} onChange={(e) => setSale(e.target.value)} /></Field>
        <dl className="calc wide">
          <div><dt>{t('Net (iskontolu) alış')}</dt><dd>{fmtMoney2(net)}</dd></div>
          <div><dt>{t('Kâr marjı')}</dt><dd>{fmtPct(marginPct(num(sale), net))}</dd></div>
        </dl>
        <Field label={t('Barkod')} wide><input name="barcode" className="mono" defaultValue={m?.barcode ?? barcode} placeholder={t('Ürünün barkodu, yoksa boş bırakın')} /></Field>
        <div className="actions wide"><button type="submit" className="btn primary" disabled={busy}>{t('Kaydet')}</button></div>
      </form>
    </Panel>
  )
}

