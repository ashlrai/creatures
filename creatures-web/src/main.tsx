import React, { useState, useEffect, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalErrorBoundary } from './components/ErrorBoundary';
import './styles/ui.css';

const App = React.lazy(() => import('./App'));
const HomePage = React.lazy(() => import('./pages/HomePage'));

function Root() {
  const [route, setRoute] = useState(() => window.location.hash);

  useEffect(() => {
    const handler = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // Marketing homepage for empty hash or #/
  const isHomepage = !route || route === '#' || route === '#/' || route === '#/home';

  if (isHomepage) {
    // Homepage: allow scrolling
    document.documentElement.classList.remove('app-mode');
    document.documentElement.classList.add('homepage-mode');
    return (
      <Suspense fallback={null}>
        <HomePage />
      </Suspense>
    );
  }

  // App: lock scrolling
  document.documentElement.classList.remove('homepage-mode');
  document.documentElement.classList.add('app-mode');
  return (
    <Suspense fallback={
      <div style={{ width: '100vw', height: '100vh', background: '#020206', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    }>
      <App />
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <Root />
    </GlobalErrorBoundary>
  </React.StrictMode>
);
