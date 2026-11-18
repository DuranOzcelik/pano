import { useEffect } from 'react'
import { flushSync } from 'react-dom'

// Hareket yardımcıları. Hepsi "hareketi azalt" ayarına uyar ve görünüm geçişi (View Transitions)
// desteklemeyen tarayıcıda animasyonsuz, aynı sonucu verir.
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const canTransition = () => typeof document.startViewTransition === 'function' && !reducedMotion()

// React durumu (useState) değiştiren bir işlemi görünüm geçişiyle yapar: eski ve yeni ekran
// arasında listeler yer değiştirerek kayar. URL parametresi değişiyorsa router'ın
// { viewTransition: true } seçeneği kullanılır, bu fonksiyon değil.
export function withTransition(fn) {
  if (!canTransition()) { fn(); return }
  document.startViewTransition(() => flushSync(fn))
}

// Görünüm geçişi adı: gruplu listelerde her grubun kendi adı olur ki filtrelenince yerinden kayarak gelsin.
// Ad sadece ASCII harf/rakam içerebilir; Türkçe karakterler koda çevrilir.
export const vtName = (prefix, key) =>
  `${prefix}-${[...String(key)].map((c) => (/[a-z0-9]/i.test(c) ? c : c.codePointAt(0).toString(36))).join('')}`

// Tema ve vurgu rengi değişimi: yeni renkler tıklanan düğmeden başlayan bir daireyle açılır.
export function themeReveal(e, fn) {
  if (!canTransition()) { fn(); return }
  const r = e.currentTarget.getBoundingClientRect()
  const root = document.documentElement
  const x = Math.round(r.left + r.width / 2)
  const y = Math.round(r.top + r.height / 2)
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  // Daire en uzak köşeye değince biter; daha büyük olursa hareketin çoğu ekran dışında geçer.
  root.style.setProperty('--vt-r', `${Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)))}px`)
  root.classList.add('vt-theme')
  const t = document.startViewTransition(() => flushSync(fn))
  t.finished.finally(() => root.classList.remove('vt-theme'))
}

// iOS bölümlü kontrolü: seçili düğmenin arkasındaki beyaz "başparmak" yeni seçime kayarak gider.
// Sayfadaki bütün .seg ve .tabs öğelerini izler; çağıran yerlerde değişiklik gerekmez.
export function useSegmentedThumbs() {
  useEffect(() => {
    const place = (seg) => {
      const on = seg.querySelector(':scope > [aria-checked="true"], :scope > [aria-selected="true"]')
      // Gizliyken (kapalı menü ya da panel) ölçü 0 gelir: başparmağı kaldır, seçili düğmenin kendi zemini görünsün.
      if (!on || !on.offsetWidth) { seg.removeAttribute('data-thumb'); return }
      seg.style.setProperty('--tx', `${on.offsetLeft}px`)
      seg.style.setProperty('--ty', `${on.offsetTop}px`)
      seg.style.setProperty('--tw', `${on.offsetWidth}px`)
      seg.style.setProperty('--th', `${on.offsetHeight}px`)
      seg.setAttribute('data-thumb', '')
    }
    let frame = 0
    const all = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => document.querySelectorAll('.seg, .tabs').forEach(place))
    }
    all()
    const mo = new MutationObserver(all)
    // 'open': panel (dialog) açılınca; 'toggle': görünüm menüsü (popover) açılınca; fonts: yazı tipi gelince genişlik değişir.
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'aria-selected', 'open'] })
    document.addEventListener('toggle', all, true)
    document.fonts?.ready.then(all)
    window.addEventListener('resize', all)
    return () => { mo.disconnect(); document.removeEventListener('toggle', all, true); window.removeEventListener('resize', all); cancelAnimationFrame(frame) }
  }, [])
}
