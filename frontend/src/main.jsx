import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.addEventListener('error', (event) => {
  alert('Global Error: ' + event.message + '\n' + event.error?.stack);
});
window.addEventListener('unhandledrejection', (event) => {
  alert('Unhandled Rejection: ' + event.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
