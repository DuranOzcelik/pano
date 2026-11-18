import { useCallback, useEffect, useState } from 'react'
import { t } from './i18n.js'

// Sunucunun hata mesajları Türkçe; arayüz dilinde gösterilir. Stok mesajı sayı taşıdığı için kalıpla eşlenir.
function serverText(s) {
  const stock = /^Stokta sadece (.+) var\.$/.exec(s)
  return stock ? t('Stokta sadece {q} var.', { q: stock[1] }) : t(s)
}

// Tüm API çağrıları buradan geçer. X-Pano başlığı sunucudaki CSRF korumasının şartı.
export async function api(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: method === 'GET' ? {} : { 'X-Pano': '1', ...(form ? {} : { 'Content-Type': 'application/json' }) },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  if (res.status === 204) return null
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null
  const msg = data?.detail || data?.title
  if (!res.ok) throw new Error(msg ? serverText(msg) : t('Sunucu hatası ({status})', { status: res.status }))
  return data
}

// Veri okuma kancası. `version` değişince yeniden yükler: bir kayıt değişince bütün ekranlar tazelenir.
export function useApi(path, version) {
  const [state, setState] = useState({ data: null, error: null })
  const reload = useCallback(() => {
    if (!path) return
    api(path).then((data) => setState({ data, error: null }), (error) => setState((s) => ({ ...s, error })))
  }, [path])
  useEffect(reload, [reload, version])
  return state
}
