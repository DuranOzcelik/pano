import en from './en.js'

// Arayüz dili. Metinler kaynakta Türkçe yazılır; t() İngilizcede en.js'teki karşılığı verir, yoksa Türkçesini.
// Seçim cihazda saklanır. Seçim yoksa sunucunun varsayılanı (ayar dosyasında "Language") geçerli.
// Kayıtlı veri (malzeme, kategori, aşama adları) çevrilmez, girildiği dilde görünür.
const KEY = 'pano-lang'
const saved = (() => { try { return localStorage.getItem(KEY) } catch { return null } })()
export let lang = saved === 'en' ? 'en' : 'tr'
document.documentElement.lang = lang

export const locale = () => (lang === 'en' ? 'en-GB' : 'tr-TR')

// Ayarlar gelince, sayfalar çizilmeden önce çağrılır.
export function applyServerLang(l) {
  if (saved || (l !== 'en' && l !== 'tr')) return
  lang = l
  document.documentElement.lang = l
}

// Dil değişince sayfa yeniden yüklenir; ekranlardaki metinler ve biçimler baştan kurulur.
export function setLang(l) {
  try { localStorage.setItem(KEY, l) } catch { /* gizli pencere: seçim saklanamaz */ }
  location.reload()
}

// t('{n} gün kaldı', { n: 3 }). Sözlükte fonksiyon olan karşılık (çoğul) değişkenlerle çağrılır.
export function t(s, vars = {}) {
  const v = lang === 'en' ? en[s] : undefined
  if (import.meta.env.DEV && lang === 'en' && v === undefined) console.warn('Çevirisi yok:', s)
  if (typeof v === 'function') return v(vars)
  return (v ?? s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}
