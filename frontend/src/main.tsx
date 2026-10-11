import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { Home, Shell } from './App'
import { CasePage } from './Case'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/case/:id" element={<CasePage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </StrictMode>,
)
