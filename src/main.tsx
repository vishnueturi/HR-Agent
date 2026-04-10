import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import './styles/index.css';

/** Embedded HR portal widget (iframe): scope theme + elevation CSS without affecting standalone app. */
if (typeof window !== 'undefined' && window.self !== window.top) {
  document.documentElement.classList.add('hr-widget');
}

createRoot(document.getElementById('root')!).render(<App />);
  