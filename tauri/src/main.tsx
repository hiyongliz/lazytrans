import ReactDOM from 'react-dom/client'

function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>LazyTrans Spike</h1>
      <p>窗口可见且不抢焦点。</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
