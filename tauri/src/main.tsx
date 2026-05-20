import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './lib/lazy-trans'
import type { TranslationState } from './lib/types'

function App() {
  const [state, setState] = useState<TranslationState | null>(null)
  const [input, setInput] = useState('')

  useEffect(() => {
    const unsub = window.lazyTrans.onTranslationUpdate(setState)
    return unsub
  }, [])

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h2>LazyTrans T1 验证</h2>
      <textarea value={input} onChange={(e) => setInput(e.target.value)}
        style={{ width: '100%', minHeight: 80 }} />
      <div style={{ marginTop: 8 }}>
        <button onClick={() => window.lazyTrans.translateInput(input)}>翻译</button>
        <button onClick={() => window.lazyTrans.cancelTranslation()}>取消</button>
        <button onClick={() => window.lazyTrans.hideWindow()}>隐藏</button>
      </div>
      <pre style={{ marginTop: 16, background: '#f4f4f4', padding: 8 }}>
        {state ? JSON.stringify(state, null, 2) : '(no state)'}
      </pre>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
