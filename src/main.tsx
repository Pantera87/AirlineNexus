import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import './styles/liquid-glass.css'
import { DatabaseInitializerWrapper } from './components/DatabaseInitializerWrapper'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DatabaseInitializerWrapper>
      <App />
    </DatabaseInitializerWrapper>
  </StrictMode>,
)
