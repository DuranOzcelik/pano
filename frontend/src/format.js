import { locale, t } from './i18n.js'

// Tarih ve para biçimleri arayüz diline göre (tr-TR ya da en-GB), tek yerde. Biçimleyici ilk kullanımda
// kurulur: dil, sunucu ayarı gelince belirlenebiliyor.
const cache = {}
const fmt = (key, opts, Ctor = Intl.DateTimeFormat) => (cache[locale() + key] ??= new Ctor(locale(), opts))
const shortDate = () => fmt('short', { day: 'numeric', month: 'short' })
const money = (d) => fmt(`money${d}`, { style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol', minimumFractionDigits: d, maximumFractionDigits: d }, Intl.NumberFormat)

// "2026-11-10" gibi tarihleri yerel gün olarak oku (UTC kayması olmasın).
const parseDay = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }

export const fmtDate = (s) => (s ? fmt('date', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDay(s)) : '—')
export const fmtShort = (s) => (s ? shortDate().format(parseDay(s)) : '—')
export const fmtDateTime = (iso) => { const d = new Date(iso); return `${shortDate().format(d)} ${fmt('time', { hour: '2-digit', minute: '2-digit' }).format(d)}` }
export const fmtLongDate = (d) => fmt('long', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
export const fmtWeekday = (d) => fmt('weekday', { weekday: 'short' }).format(d)
export const fmtMoney = (n) => money(0).format(n ?? 0)
export const fmtMoney2 = (n) => money(2).format(n ?? 0) // birim fiyatlar kuruşlu
export const fmtNum = (n) => fmt('num', { maximumFractionDigits: 3 }, Intl.NumberFormat).format(n ?? 0)
export const daysFrom = (s) => Math.round((parseDay(s) - today()) / 864e5)
export const isoToday = () => { const t = today(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` }

// "3 gün gecikti" / "bugün" / "12 gün kaldı"
export function dueText(s) {
  const n = daysFrom(s)
  if (n < 0) return t('{n} gün gecikti', { n: -n })
  if (n === 0) return t('bugün')
  return t('{n} gün kaldı', { n })
}

// Arama ve anahtar kelime eşleşmesi: büyük/küçük harf ve ı/i farkı gözetilmez; Türkçe ve İngilizce veride aynı çalışır.
export const fold = (s) => s.toLocaleLowerCase('tr').replaceAll('ı', 'i')
export const trIncludes = (hay, q) => fold(hay).includes(fold(q))

// Toptan alım: iskontolu (net) birim fiyat; sunucudaki Rules.NetPrice ile aynı hesap.
export const netPrice = (list, discount) => Math.round((Number(list) || 0) * (1 - (Number(discount) || 0) / 100) * 100) / 100
// Kâr marjı, net alışa göre yüzde. Alış 0 ise hesaplanmaz.
export const marginPct = (sale, net) => (net > 0 && sale > 0 ? ((sale - net) / net) * 100 : null)
// Yüzde: Türkçede "%12,5", İngilizcede "12.5%".
export const fmtPct = (n) => (n == null ? '—' : fmt('pct', { style: 'percent', maximumFractionDigits: 1 }, Intl.NumberFormat).format(n / 100))
