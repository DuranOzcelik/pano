import { useEffect, useRef, useState } from 'react'
import { Panel } from './ui.jsx'
import { t } from './i18n.js'

// Ürün barkodları (EAN/UPC), iç barkod (EAN-13, 29…) ve koli barkodları.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']

// Android Chrome'un kendi barkod okuyucusu varsa onu, yoksa (iPhone, masaüstü) zxing'in wasm sürümünü kullanır.
// wasm dosyası uygulamayla birlikte paketlenir, internetten indirilmez: ofiste internet olmasa da okur.
// Bir kez hazırlanır; kamera her açıldığında wasm yeniden yüklenmez.
let detector
export const makeDetector = () => (detector ??= createDetector().catch((e) => { detector = undefined; throw e }))
async function createDetector() {
  if ('BarcodeDetector' in window) {
    const supported = await window.BarcodeDetector.getSupportedFormats()
    if (supported.includes('ean_13')) return new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) })
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasm }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm : prefix + path) } })
  return new BarcodeDetector({ formats: FORMATS })
}

// Kamera ancak güvenli bağlantıda açılır: ofis bilgisayarında localhost, telefonda Tailscale'in https adresi.
export const canUseCamera = () => !!navigator.mediaDevices?.getUserMedia

// Arka kamerayı açar, ilk okunan barkodu onCode'a verir. Panel kapanınca kamera kapanır.
export function KameraOkut({ onCode, onClose }) {
  const video = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let stream, timer, stopped = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return } // izin beklerken panel kapandıysa
        video.current.srcObject = stream
        await video.current.play()
        const detector = await makeDetector()
        const tick = async () => {
          if (stopped) return
          try {
            const [hit] = await detector.detect(video.current)
            if (hit?.rawValue) { stopped = true; navigator.vibrate?.(60); onCode(hit.rawValue.trim()); return }
          } catch { /* kare henüz hazır değil, bir sonrakini dene */ }
          timer = setTimeout(tick, 200)
        }
        tick()
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? t('Kamera izni verilmedi. Tarayıcıda bu siteye kamera izni verip yeniden deneyin.')
          : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? t('Bu cihazda kamera bulunamadı.')
            : t('Kamera açılamadı: {msg}', { msg: e.message }))
      }
    })()
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])
  return (
    <Panel title={t('Kamerayla okut')} sub={t('Barkodu çerçevenin içine getirin, okununca panel kendiliğinden açılır.')} onClose={onClose}>
      {error ? <p className="empty">{error}</p> : <video ref={video} className="camera" playsInline muted aria-label={t('Kamera görüntüsü')} />}
    </Panel>
  )
}
