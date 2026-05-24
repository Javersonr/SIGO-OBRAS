import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isLoadingAuth] = useState(false);
  const [isLoadingPublicSettings] = useState(false);
  const [authError] = useState(null);

  const navigateToLogin = () => {
    window.location.href = '/EntrarSistema';
  };

  return (
    <AuthContext.Provider value={{ 
      user: null,
      isAuthenticated: false,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings: null,
      logout: () => {},
      navigateToLogin,
      checkAppState: () => {}
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};