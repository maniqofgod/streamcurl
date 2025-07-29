import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import '../../css/modules/_layout.css';

const MainLayout = ({ children, title, user, onLogout }) => {
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

    const toggleSidebar = () => {
        setSidebarCollapsed(!isSidebarCollapsed);
    };

    return (
        <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <aside className="app-sidebar">
                <div className="sidebar-header">
                    <h2 className="sidebar-logo">StreamPro</h2>
                    <button className="sidebar-toggle-btn" onClick={toggleSidebar}>
                        <i className={`fas ${isSidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`}></i>
                    </button>
                </div>
                <nav className="sidebar-nav">
                    <NavLink to="/" end><i className="fas fa-tachometer-alt"></i><span>Dashboard</span></NavLink>
                    <NavLink to="/streams"><i className="fas fa-video"></i><span>Streams</span></NavLink>
                    <NavLink to="/gallery"><i className="fas fa-images"></i><span>Gallery</span></NavLink>
                    <NavLink to="/vps"><i className="fas fa-server"></i><span>My VPS</span></NavLink>
                    <NavLink to="/editor"><i className="fas fa-magic"></i><span>Create</span></NavLink>
                    {user?.role === 'admin' && (
                        <NavLink to="/admin"><i className="fas fa-user-shield"></i><span>Admin</span></NavLink>
                    )}
                    <NavLink to="/settings"><i className="fas fa-cog"></i><span>Settings</span></NavLink>
                </nav>
                <div className="sidebar-footer">
                    <div className="user-profile">
                        {user?.profile_image_url ? (
                            <img src={`http://localhost:8001${user.profile_image_url}`} alt="Profile" className="profile-pic" />
                        ) : (
                            <i className="fas fa-user-circle"></i>
                        )}
                        <div className="user-details">
                            <span className="username">{user?.username}</span>
                            <span className="role">{user?.is_superuser ? 'Admin' : 'User'}</span>
                        </div>
                    </div>
                    <button onClick={onLogout} className="logout-btn">
                        <i className="fas fa-sign-out-alt"></i>
                        <span>Logout</span>
                    </button>
                </div>
            </aside>
            <div className="main-content">
                <header className="app-header">
                    <h1>{title}</h1>
                </header>
                <main className="app-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default MainLayout;