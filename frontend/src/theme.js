import { useState } from 'react'

// Görünüm cihaz başına saklanır (tarayıcıda). Kayıt yoksa sistem teması ve mavi vurgu.
export const ACCENTS = [
  ['blue', 'Mavi'], ['indigo', 'Çivit'], ['purple', 'Mor'], ['pink', 'Pembe'],
  ['orange', 'Turuncu'], ['green', 'Yeşil'], ['teal', 'Turkuaz'],
]
export const MODES = [['light', 'Açık'], ['dark', 'Koyu'], ['system', 'Sistem']]

const read = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* gizli pencere vb. */ } }

function apply(mode, accent) {
  const el = document.documentElement
  if (mode === 'system') delete el.dataset.theme
  else el.dataset.theme = mode
  el.dataset.accent = accent
}

export function useTheme() {
  const [mode, setMode] = useState(() => read('pano-theme', 'system'))
  const [accent, setAccent] = useState(() => read('pano-accent', 'blue'))
  return {
    mode, accent,
    setMode: (m) => { setMode(m); write('pano-theme', m); apply(m, accent) },
    setAccent: (a) => { setAccent(a); write('pano-accent', a); apply(mode, a) },
  }
}
