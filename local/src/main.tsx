import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

;(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = '/'
createRoot(document.getElementById('root')!).render(<App />)
