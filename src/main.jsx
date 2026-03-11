import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StatTool from './tools/stat/StatTool'
import DefineTool from './tools/define/DefineTool'

function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #eee' }}>
        <a href="https://changebefore.com/stat/" style={{ marginRight: '1rem' }}>STAT</a>
        <a href="https://changebefore.com/define-access/">Define Your System</a>
      </nav>
      <Routes>
        <Route path="/stat" element={<StatTool />} />
        <Route path="/define" element={<DefineTool />} />
        <Route path="/" element={<div style={{ padding: '2rem' }}><h1>ChangeBefore Tools</h1><p>Select a tool from the nav above.</p></div>} />
      </Routes>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
