import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { startPuterKeepAlive } from './services/puterService';
import { ErrorBoundary } from './components/ErrorBoundary';

// Initialize Puter keep-alive listener immediately
startPuterKeepAlive();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
