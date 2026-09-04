import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useData } from './data/store'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'

// Dev-only handle, so the graph can be seeded and inspected from the console.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).skillTree = useData

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
