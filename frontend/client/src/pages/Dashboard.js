import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getDashboardData, readVpsList, adminReadVpsList } from '../services/api';
import '../css/modules/_dashboard.css';

const StatCard = ({ title, value, subValue, icon, error, children }) => (
    <div className="stat-card-v2">
        <div className="stat-card-v2-header">
            <i className={`fas ${icon}`}></i>
            <span>{title}</span>
        </div>
        <div className="stat-card-v2-body">
            {error ? <span className="error-text">{error}</span> : (
                children ? children : (
                    <>
                        <h2>{value}</h2>
                        {subValue && <p className="sub-value">{subValue}</p>}
                    </>
                )
            )}
        </div>
    </div>
);

const MainCard = ({ title, children }) => (
    <div className="main-card">
        <h3>{title}</h3>
        <div className="main-card-content">
            {children}
        </div>
    </div>
);

const AdminStatCard = ({ title, value }) => (
    <div className="admin-stat-card">
        <h4>{title}</h4>
        <p>{value}</p>
    </div>
);

const Dashboard = () => {
    const { user: currentUser } = useOutletContext();
    const [dashboardData, setDashboardData] = useState(null);
    const [vpsList, setVpsList] = useState([]);
    const [selectedVpsId, setSelectedVpsId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDashboardData = useCallback(async () => {
        if (!currentUser) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getDashboardData(selectedVpsId || null);
            setDashboardData(data);
        } catch (err) {
            setError('Failed to fetch dashboard data.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [currentUser, selectedVpsId]);

    useEffect(() => {
        const fetchInitialData = async () => {
            if (!currentUser) return;
            try {
                const vpsData = currentUser.role === 'admin' 
                    ? await adminReadVpsList() 
                    : await readVpsList();
                setVpsList(vpsData);
                if (vpsData.length > 0) {
                    setSelectedVpsId(vpsData[0].id);
                }
            } catch (err) {
                setError('Failed to fetch initial data.');
                console.error(err);
            }
        };
        fetchInitialData();
    }, [currentUser]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    if (loading && !dashboardData) {
        return <div className="dashboard-container">Loading...</div>;
    }

    if (error) {
        return <div className="dashboard-container error-text">{error}</div>;
    }
    
    if (!dashboardData) {
        return <div className="dashboard-container">No data available.</div>;
    }

    const { vps_stats, gdrive_stats, stream_stats, recent_streams, admin_stats } = dashboardData;

    return (
        <div className="dashboard-v2">
            <div className="dashboard-header">
                <select 
                    className="vps-selector" 
                    value={selectedVpsId} 
                    onChange={(e) => setSelectedVpsId(e.target.value)}
                    disabled={vpsList.length === 0}
                >
                    <option value="">{currentUser?.role === 'admin' ? 'Local Server' : 'Select a VPS'}</option>
                    {vpsList.map(vps => (
                        <option key={vps.id} value={vps.id}>{vps.name} ({vps.ip_address})</option>
                    ))}
                </select>
            </div>

            <div className="stats-bar">
                <StatCard title="VPS CPU Usage" value={`${vps_stats.cpu_usage_percent?.toFixed(1) || 0}%`} icon="fa-microchip" error={vps_stats.error} />
                <StatCard title="RAM Usage" value={`${vps_stats.ram_usage_percent?.toFixed(1) || 0}%`} icon="fa-memory" />
                {currentUser?.role === 'admin' && (
                    <StatCard 
                        title="Google Drive Usage" 
                        value={`${parseFloat(gdrive_stats.usage_percent)?.toFixed(1) || 0}%`} 
                        subValue={gdrive_stats.error ? '' : `${gdrive_stats.usage_gb} GB / ${gdrive_stats.limit_gb} GB`}
                        icon="fab fa-google-drive"
                        error={gdrive_stats.error}
                    />
                )}
                <StatCard title="Total Streams" value={stream_stats.total} icon="fa-video" />
                
                <StatCard title="Network I/O" icon="fa-network-wired">
                    <div className="network-io-container">
                        <div className="network-io-item">
                            <i className="fas fa-arrow-up"></i>
                            <div>
                                <span className="network-io-value">{vps_stats.network_io?.sent || 'N/A'}</span>
                                <span className="network-io-label">Sent</span>
                            </div>
                        </div>
                        <div className="network-io-item">
                            <i className="fas fa-arrow-down"></i>
                            <div>
                                <span className="network-io-value">{vps_stats.network_io?.recv || 'N/A'}</span>
                                <span className="network-io-label">Received</span>
                            </div>
                        </div>
                    </div>
                </StatCard>

                <StatCard title="Active/Inactive" icon="fa-broadcast-tower">
                    <div className="stream-status-container">
                        <span className="active">{stream_stats.active}</span>
                        <span className="separator">/</span>
                        <span className="inactive">{stream_stats.inactive}</span>
                    </div>
                </StatCard>
            </div>

            <div className="main-content-grid">
                <MainCard title="Recent Streams">
                    <ul className="recent-streams-list">
                        {recent_streams && recent_streams.length > 0 ? (
                            recent_streams.map(item => (
                                <li key={item.id}>
                                    <span className="stream-name">{item.name}</span>
                                    <span className={`stream-status ${item.status?.toLowerCase()}`}>{item.status}</span>
                                    <span className="stream-timestamp">{new Date(item.created_at).toLocaleString()}</span>
                                </li>
                            ))
                        ) : (
                            <p>No recent streams found.</p>
                        )}
                    </ul>
                </MainCard>
                {currentUser?.role === 'admin' && admin_stats && (
                    <MainCard title="Admin Stats">
                        <AdminStatCard title="Total Users" value={admin_stats.total_users} />
                        <AdminStatCard title="Total Streams (All Users)" value={admin_stats.total_all_streams} />
                    </MainCard>
                )}
            </div>
        </div>
    );
};

export default Dashboard;