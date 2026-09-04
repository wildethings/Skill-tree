import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useData } from './data/store'
import { useUI } from './ui/uiStore'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'

// Dev-only handle, so the graph can be seeded and inspected from the console.
if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, { skillTree: useData, skillTreeUI: useUI })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
