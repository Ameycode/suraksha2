
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
const fallbackUi = document.getElementById('fallback-ui');

if (rootElement) {
  // Immediately hide fallback UI to prevent overlap with the React app
  if (fallbackUi) {
    fallbackUi.style.display = 'none';
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
