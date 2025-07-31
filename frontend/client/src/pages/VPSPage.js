import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import '../css/modules/_admin_page.css';
import '../css/modules/_modal.css';

const VPSPage = () => {
    const [vpsList, setVpsList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newVps, setNewVps] = useState({ name: '', ip_address: '', port: 8001, api_key: '' });
    const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);
    const [guideLang, setGuideLang] = useState('id');
    const [copySuccess, setCopySuccess] = useState('');
    
    const [editingVpsId, setEditingVpsId] = useState(null);
    const [editingVpsData, setEditingVpsData] = useState({ api_key: '' });
    const [testResult, setTestResult] = useState(null);

    const installCommand = 'bash -c "$(wget -qO- https://raw.githubusercontent.com/maniqofgod/vps-agent/main/install.sh)"';

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopySuccess('Tersalin!');
            setTimeout(() => setCopySuccess(''), 2000);
        }, () => {
            setCopySuccess('Gagal menyalin!');
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
            setError('Gagal mengambil daftar VPS Anda.');
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
            setError('Semua bidang wajib diisi.');
            return;
        }
        try {
            await api.createVps(newVps);
            setNewVps({ name: '', ip_address: '', port: 8001, api_key: '' });
            setError('');
            fetchUserVps();
        } catch (err) {
            setError(err.response?.data?.detail || 'Gagal menambahkan VPS.');
            console.error(err);
        }
    };

    const handleDeleteVps = async (vpsId) => {
        if (window.confirm('Apakah Anda yakin ingin menghapus VPS ini?')) {
            try {
                await api.deleteVps(vpsId);
                fetchUserVps();
            } catch (err) {
                setError(err.response?.data?.detail || 'Gagal menghapus VPS.');
                console.error(err);
            }
        }
    };

    const handleTestVps = async (vpsId) => {
        setTestResult({ vpsId, loading: true });
        try {
            const result = await api.testVpsConnection(vpsId);
            setTestResult({ vpsId, result });
        } catch (err) {
            const errorDetail = err.response?.data?.detail || 'Failed to run test.';
            setTestResult({ vpsId, error: errorDetail });
            console.error(err);
        }
    };

    const handleEditClick = (vps) => {
        setEditingVpsId(vps.id);
        setEditingVpsData({ api_key: vps.api_key });
    };

    const handleEditChange = (e) => {
        setEditingVpsData({ ...editingVpsData, [e.target.name]: e.target.value });
    };

    const handleUpdateVps = async (vpsId) => {
        try {
            await api.updateVps(vpsId, editingVpsData);
            setEditingVpsId(null);
            fetchUserVps();
        } catch (err) {
            setError(err.response?.data?.detail || 'Gagal memperbarui VPS.');
            console.error(err);
        }
    };

    const renderTestResult = () => {
        if (!testResult) return null;
        if (testResult.loading) return <p>Testing VPS...</p>;
        if (testResult.error) return <p className="error">Error: {testResult.error}</p>;

        const { connection, ffmpeg } = testResult.result;
        return (
            <div className="test-results" style={{ marginTop: '15px' }}>
                <h4>Test Results for VPS ID: {testResult.vpsId}</h4>
                <p><strong>Connection:</strong> {connection.status} - {typeof connection.details === 'object' ? JSON.stringify(connection.details) : connection.details}</p>
                <p><strong>FFmpeg:</strong> {ffmpeg.status} - {typeof ffmpeg.details === 'object' ? JSON.stringify(ffmpeg.details) : ffmpeg.details}</p>
            </div>
        );
    };

    if (isLoading) {
        return <div className="loading-container">Memuat Manajemen VPS...</div>;
    }

    const guideContent = {
        id: {
            title: "Panduan Instalasi Agen VPS",
            p1: "Jalankan perintah tunggal ini di VPS baru (disarankan Ubuntu 20.04+):",
            p2: "Setelah skrip selesai, itu akan menampilkan Kunci API. Gunakan informasi tersebut untuk mengisi formulir \"Tambah VPS Baru\" di sini."
        },
        en: {
            title: "VPS Agent Installation Guide",
            p1: "Run this single command on a new VPS (Ubuntu 20.04+ recommended):",
            p2: "After the script finishes, it will display the API Key. Use that information to fill out the \"Add New VPS\" form here."
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
                                <button onClick={() => copyToClipboard(installCommand)} className="copy-btn">
                                    {copySuccess || 'Salin'}
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
                        <p>Gunakan perintah ini di terminal VPS Anda untuk mengelola agen (di dalam direktori `~/streamcurl-vps-agent`):</p>
                        <ul>
                            <li><strong>Periksa Status & Log:</strong> <code>docker-compose logs -f</code></li>
                            <li><strong>Mulai Ulang Agen:</strong> <code>docker-compose restart</code></li>
                            <li><strong>Hentikan Agen:</strong> <code>docker-compose down</code></li>
                        </ul>
                    </div>
                </div>

                <div className="admin-card">
                    <h2 className="card-title">My VPS List</h2>
                    <ul className="secret-list">
                        {vpsList.length > 0 ? vpsList.map(vps => (
                            <li key={vps.id}>
                                {editingVpsId === vps.id ? (
                                    <div className="edit-vps-form">
                                        <input
                                            type="text"
                                            name="api_key"
                                            value={editingVpsData.api_key}
                                            onChange={handleEditChange}
                                            placeholder="New API Key"
                                        />
                                        <button onClick={() => handleUpdateVps(vps.id)} className="glass-button-small">Save</button>
                                        <button onClick={() => setEditingVpsId(null)} className="glass-button-small cancel">Cancel</button>
                                    </div>
                                ) : (
                                    <>
                                        <span>{vps.name} ({vps.ip_address}:{vps.port})</span>
                                        <div className="vps-actions">
                                            <button onClick={() => handleTestVps(vps.id)} className="glass-button-small">Test</button>
                                            <button onClick={() => handleEditClick(vps)} className="glass-button-small">Edit</button>
                                            <button onClick={() => handleDeleteVps(vps.id)} className="delete-btn">Delete</button>
                                        </div>
                                    </>
                                )}
                            </li>
                        )) : (
                            <p>Anda belum menambahkan VPS.</p>
                        )}
                    </ul>
                    {renderTestResult()}
                </div>
            </div>
        </div>
    );
};

export default VPSPage;