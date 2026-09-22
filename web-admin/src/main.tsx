import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './stil.css';

const wurzel = document.getElementById('wurzel');
if (wurzel === null) throw new Error('Wurzelelement nicht gefunden');

createRoot(wurzel).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
