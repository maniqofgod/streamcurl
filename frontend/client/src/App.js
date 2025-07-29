import React, { useState, useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom';
import './css/style.css';
import api from './services/api';
import Dashboard from './pages/Dashboard';
import Streams from './pages/Streams';
import Editor from './pages/Editor';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Register from './pages/Register';
import VPSPage from './pages/VPSPage';
import AccountSettings from './pages/AccountSettings';
import GoogleDriveSettings from './pages/GoogleDriveSettings';
import GoogleDriveGallery from './pages/GoogleDriveGallery'; // Import the new gallery
import MainLayout from './components/layout/MainLayout';

const getPageTitle = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'Dashboard';
  const title = parts[parts.length - 1];
  return title.charAt(0).toUpperCase() + title.slice(1).replace(/([A-Z])/g, ' $1').trim();
};

const ProtectedLayout = ({ user, onLogout }) => {
  const location = useLocation();
  const title = getPageTitle(location.pathname);

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <MainLayout user={user} onLogout={onLogout} title={title}>
      <Outlet context={{ user }} />
    </MainLayout>
  );
};

const AdminRoute = ({ user }) => {
  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <Outlet context={{ user }} />;
};

const ProtectedEditor = ({ user }) => {
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Editor />;
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const response = await api.get('/api/v1/auth/users/me');
          setUser(response.data);
        } catch (err) {
          localStorage.removeItem('access_token');
          setUser(null);
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const handleLogin = async () => {
    try {
      const response = await api.get('/api/v1/auth/users/me');
      setUser(response.data);
    } catch (err) {
      setUser(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setUser(null);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  const router = createBrowserRouter([
    {
      path: "/login",
      element: !user ? <Login onLogin={handleLogin} /> : <Navigate to="/" />,
    },
    {
      path: "/register",
      element: !user ? <Register /> : <Navigate to="/" />,
    },
    {
      path: "/editor",
      element: <ProtectedEditor user={user} />,
    },
    {
      path: "/editor/:streamId",
      element: <ProtectedEditor user={user} />,
    },
    {
      path: "/",
      element: <ProtectedLayout user={user} onLogout={handleLogout} />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: "streams", element: <Streams /> },
        { 
          element: <AdminRoute user={user} />,
          children: [
            { path: "admin", element: <Admin /> },
            { path: "admin/gdrive", element: <GoogleDriveSettings /> },
          ]
        },
        { path: "gallery", element: <GoogleDriveGallery /> }, // Add the new gallery route
        { path: "settings", element: <AccountSettings /> },
        { path: "vps", element: <VPSPage /> },
      ],
    },
    {
      path: "*",
      element: <Navigate to="/" />,
    },
  ]);

  return <RouterProvider router={router} />;
}

export default App;
