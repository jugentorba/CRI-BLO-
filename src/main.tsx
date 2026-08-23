import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MSALProvider } from '@azure/react-msal';
import { PublicClientApplication } from '@azure/msal-browser';
import FieldWorkApp from '@/app/FieldWorkApp';
import { networkService } from '@/lib/sync/NetworkService';
import '@/styles/globals.css';

// Initialize MSAL for Azure authentication
const msalConfig = {
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID || '',
    authority: process.env.REACT_APP_AZURE_AUTHORITY || '',
    redirectUri: process.env.REACT_APP_REDIRECT_URI || 'http://localhost:3000',
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

const msalInstance = new PublicClientApplication(msalConfig);

// Initialize network monitoring
null;
null;
networkService.initialize().catch((error) => {
  console.warn('Failed to initialize network monitoring:', error);
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <MSALProvider instance={msalInstance}>
      <Router>
        <Routes>
          <Route path="/work" element={<FieldWorkApp />} />
          <Route path="/" element={<Navigate to="/work" replace />} />
        </Routes>
      </Router>
    </MSALProvider>
  </React.StrictMode>
);

export default root;