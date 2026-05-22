import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StatTool from './tools/stat/StatTool'
import DefineTool from './tools/define/DefineTool'
import StrategyLab from './tools/strategy-lab/StrategyLab'
import StrawTool from './tools/straw/Straw'
import Straw2Tool from './tools/straw/Straw2'
import Straw3Tool from './tools/straw/Straw3'
import PurposeTool from './tools/purpose/Purpose'

const Home = () => (
  <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#f0ede8', minHeight: '100vh', padding: '48px 32px' }}>
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 400, letterSpacing: 3, textTransform: 'uppercase', color: '#888', marginBottom: 8 }}>ChangeBefore</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 400, color: '#1a1a1a', marginBottom: 32 }}>Diagnostic Tools</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { path: '/straw', label: 'STRAWPERSON Scenario Tool', desc: 'Financial viability scenario — 15 steps' },
          { path: '/straw2', label: 'STRAWPERSON Scenario Tool v2', desc: 'Financial viability scenario — expanded revenue lines' },
          { path: '/straw3', label: 'STRAWPERSON Scenario Tool v3', desc: 'Four-year scenario — 2027, 2028, 2029, 2030' },
          { path: '/purpose', label: 'Purpose Tool', desc: 'Purpose, mission and distinctiveness — 9 steps' },
          { path: '/stat', label: 'STAT', desc: 'Strategic assessment tool' },
          { path: '/strategy-lab', label: 'Strategy Lab', desc: 'Full financial viability scenario tool' },
        ].map(t => (
          <a key={t.path} href={t.path} style={{ display: 'block', padding: '16px 20px', background: '#fff', border: '1px solid #d8d3cb', borderRadius: 4, textDecoration: 'none' }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{t.label}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888' }}>{t.desc}</div>
          </a>
        ))}
      </div>
    </div>
  </div>
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/stat" element={<StatTool />} />
        <Route path="/define" element={<DefineTool />} />
        <Route path="/strategy-lab" element={<StrategyLab />} />
        <Route path="/straw" element={<StrawTool />} />
        <Route path="/straw2" element={<Straw2Tool />} />
        <Route path="/straw3" element={<Straw3Tool />} />
        <Route path="/purpose" element={<PurposeTool />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
