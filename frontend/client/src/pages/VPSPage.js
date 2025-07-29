import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import '../css/modules/_admin_page.css'; // Re-using the glassmorphism style
import '../css/modules/_modal.css'; // Import modal styles

const VPSPage = () => {
    const [vpsList, setVpsList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newVps, setNewVps] = useState({ name: '', ip_address: '', port: 8001, api_key: '' });
    const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);
    const [guideLang, setGuideLang] = useState('id'); // 'id' for Indonesian, 'en' for English
    const [copySuccess, setCopySuccess] = useState('');

    const installCommand = 'bash <(curl -sL https://raw.githubusercontent.com/maniqofgod/streamcurl-agent/main/install.sh)';

    const copyToClipboard = () => {
        navigator.clipboard.writeText(installCommand).then(() => {
            setCopySuccess('Copied!');
            setTimeout(() => setCopySuccess(''), 2000);
        }, () => {
            setCopySuccess('Failed to copy!');
            setTimeout(() => setCopySuccess(''), 2000);
        });
    };

    const fetchUserVps = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await api.readVpsList();
            setVpsList(data);
            setError('');
        } catch (err) {
            setError('Failed to fetch your VPS list.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUserVps();
    }, [fetchUserVps]);

    const handleNewVpsChange = (e) => {
        const { name, value, type } = e.target;
        setNewVps(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value, 10) : value }));
    };

    const handleAddVps = async (e) => {
        e.preventDefault();
        if (!newVps.name || !newVps.ip_address || !newVps.api_key) {
            setError('All fields are required.');
            return;
        }
        try {
            await api.createVps(newVps);
            setNewVps({ name: '', ip_address: '', port: 8001, api_key: '' });
            setError('');
            fetchUserVps(); // Refresh list
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add VPS.');
            console.error(err);
        }
    };

    const handleDeleteVps = async (vpsId) => {
        if (window.confirm('Are you sure you want to delete this VPS?')) {
            try {
                await api.deleteVps(vpsId);
                fetchUserVps(); // Refresh list
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to delete VPS.');
                console.error(err);
            }
        }
    };

    if (isLoading) {
        return <div className="loading-container">Loading VPS Management...</div>;
    }

    if (!vpsList) {
        return <div className="loading-container">Could not load VPS list. Please try again later.</div>;
    }

    const guideContent = {
        id: {
            title: "Panduan Instalasi Agen VPS",
            p1: "Jalankan perintah tunggal ini di VPS baru (disarankan Ubuntu 20.04+):",
            p2: "Setelah skrip selesai, itu akan menampilkan Alamat IP, Port, dan Kunci API. Gunakan informasi tersebut untuk mengisi formulir \"Tambah VPS Baru\" di sini."
        },
        en: {
            title: "VPS Agent Installation Guide",
            p1: "Run this single command on a new VPS (Ubuntu 20.04+ recommended):",
            p2: "After the script finishes, it will display the IP Address, Port, and API Key. Use that information to fill out the \"Add New VPS\" form here."
        }
    };

    return (
        <div className="admin-page">
            {isInstallGuideOpen && (
                <div className="modal-backdrop" onClick={() => setIsInstallGuideOpen(false)}>
                    <div className="modal-content large" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{guideContent[guideLang].title}</h3>
                            <div className="lang-toggle">
                                <button onClick={() => setGuideLang('id')} className={guideLang === 'id' ? 'active' : ''}>ID</button>
                                <button onClick={() => setGuideLang('en')} className={guideLang === 'en' ? 'active' : ''}>EN</button>
                            </div>
                            <button onClick={() => setIsInstallGuideOpen(false)} className="modal-close-btn">&times;</button>
                        </div>
                        <div className="modal-body">
                            <p>{guideContent[guideLang].p1}</p>
                            <div className="command-container">
                                <pre><code>{installCommand}</code></pre>
                                <button onClick={copyToClipboard} className="copy-btn">
                                    {copySuccess || 'Copy'}
                                </button>
                            </div>
                            <p>{guideContent[guideLang].p2}</p>
                        </div>
                    </div>
                </div>
            )}

            <h1 className="admin-title">My VPS Management</h1>
            {error && <div className="admin-error">{error}</div>}
            <div className="vps-page-container">
                <div className="admin-card">
                    <div className="card-title-container">
                        <h2 className="card-title">Add New VPS</h2>
                        <button onClick={() => setIsInstallGuideOpen(true)} className="glass-button-small">
                            Show Install Guide
                        </button>
                    </div>
                    <form onSubmit={handleAddVps} className="admin-form">
                        <input type="text" name="name" placeholder="VPS Name" value={newVps.name} onChange={handleNewVpsChange} required />
                        <input type="text" name="ip_address" placeholder="IP Address" value={newVps.ip_address} onChange={handleNewVpsChange} required />
                        <input type="number" name="port" placeholder="Port" value={newVps.port} onChange={handleNewVpsChange} required />
                        <input type="text" name="api_key" placeholder="API Key" value={newVps.api_key} onChange={handleNewVpsChange} required />
                        <button type="submit" className="glass-button">Add VPS</button>
                    </form>
<div className="service-commands" style={{ marginTop: '20px' }}>
                        <h3 className="card-subtitle">Perintah Manajemen Layanan</h3>
                        <p>Gunakan perintah ini di terminal VPS Anda untuk mengelola agen:</p>
                        <ul>
                            <li>
                                <strong>Periksa Status:</strong>
                                <code>sudo systemctl status streamcurl-agent</code>
                            </li>
                            <li>
                                <strong>Lihat Log Langsung:</strong>
                                <code>sudo journalctl -u streamcurl-agent -f</code>
                            </li>
                            <li>
                                <strong>Mulai Ulang Agen:</strong>
                                <code>sudo systemctl restart streamcurl-agent</code>
                            </li>
                             <li>
                                <strong>Hentikan Agen:</strong>
                                <code>sudo systemctl stop streamcurl-agent</code>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="admin-card">
                    <h2 className="card-title">My VPS List</h2>
                    <ul className="secret-list">
                        {vpsList.length > 0 ? vpsList.map(vps => (
                            <li key={vps.id}>
                                <span>{vps.name} ({vps.ip_address}:{vps.port}) </span>
                                <button onClick={() => handleDeleteVps(vps.id)} className="delete-btn">Delete</button>
                            </li>
                        )) : (
                            <p>You haven't added any VPS yet.</p>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default VPSPage;