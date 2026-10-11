import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { Home, Shell } from './App'
import { CasePage } from './Case'
import { ComparePage } from './Compare'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/case/:id/*" element={<CasePage />} />
          <Route path="/compare" element={<ComparePage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </StrictMode>,
)
