import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StatTool from './tools/stat/StatTool'
import DefineTool from './tools/define/DefineTool'
import StrategyLab from './tools/strategy-lab/StrategyLab'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/stat" element={<StatTool />} />
        <Route path="/define" element={<DefineTool />} />
        <Route path="/strategy-lab" element={<StrategyLab />} />
        <Route path="/" element={<div style={{ padding: '2rem' }}><h1>ChangeBefore Tools</h1></div>} />
      </Routes>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
