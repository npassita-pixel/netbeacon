import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './wcag-scanner.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
