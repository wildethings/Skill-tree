import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useData } from './data/store'
import { useUI } from './ui/uiStore'
// Self-hosted: the font ships with the bundle rather than being fetched from a
// third party, so the page renders in its own typeface offline and makes no
// request to Google.
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
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
