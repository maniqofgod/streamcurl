import React, { useState } from 'react';
import * as api from '../services/api';

const VPSManager = ({ user, onVpsChange }) => {
    const [newVps, setNewVps] = useState({ name: '', ip_address: '', port: 8001, api_key: '' });
    const [editingVpsId, setEditingVpsId] = useState(null);
    const [editingVpsData, setEditingVpsData] = useState({ api_key: '' });
    const [error, setError] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [showInstallGuide, setShowInstallGuide] = useState(false);

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
            await api.adminCreateVpsForUser(user.id, newVps);
            setNewVps({ name: '', ip_address: '', port: 8001, api_key: '' });
            setError('');
            onVpsChange();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add VPS.');
            console.error(err);
        }
    };

    const handleDeleteVps = async (vpsId) => {
        if (window.confirm('Are you sure you want to delete this VPS?')) {
            try {
                await api.adminDeleteVps(vpsId);
                onVpsChange();
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to delete VPS.');
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
            await api.adminUpdateVps(vpsId, editingVpsData);
            setEditingVpsId(null);
            onVpsChange();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update VPS.');
            console.error(err);
        }
    };

    const renderTestResult = () => {
        if (!testResult) return null;
        if (testResult.loading) return <p>Testing VPS...</p>;
        if (testResult.error) return <p className="error">Error: {testResult.error}</p>;

        const { connection, ffmpeg } = testResult.result;
        return (
            <div className="test-results">
                <h4>Test Results</h4>
                <p><strong>Connection:</strong> {connection.status} - {typeof connection.details === 'object' ? JSON.stringify(connection.details) : connection.details}</p>
                <p><strong>FFmpeg:</strong> {ffmpeg.status} - {typeof ffmpeg.details === 'object' ? JSON.stringify(ffmpeg.details) : ffmpeg.details}</p>
            </div>
        );
    };

    return (
        <div className="vps-manager">
            <h2>My VPS Management</h2>
            <h4>VPS for {user.username}</h4>
            {error && <p className="error">{error}</p>}
            <ul className="vps-list">
                {user.vps && user.vps.map(vps => (
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
                                <button onClick={() => handleUpdateVps(vps.id)}>Save</button>
                                <button onClick={() => setEditingVpsId(null)}>Cancel</button>
                            </div>
                        ) : (
                            <>
                                <span>{vps.name} ({vps.ip_address}:{vps.port})</span>
                                <div className="vps-actions">
                                    <button onClick={() => handleTestVps(vps.id)}>Test</button>
                                    <button onClick={() => handleEditClick(vps)}>Edit</button>
                                    <button onClick={() => handleDeleteVps(vps.id)}>Delete</button>
                                </div>
                            </>
                        )}
                    </li>
                ))}
            </ul>

            {renderTestResult()}

            <div className="add-new-vps">
                <h5>Add New VPS</h5>
                <button onClick={() => setShowInstallGuide(!showInstallGuide)} className="show-install-guide-btn">
                    {showInstallGuide ? 'Hide' : 'Show'} Install Guide
                </button>
                <form onSubmit={handleAddVps} className="vps-form">
                    <input type="text" name="name" placeholder="VPS Name" value={newVps.name} onChange={handleNewVpsChange} required />
                    <input type="text" name="ip_address" placeholder="IP Address" value={newVps.ip_address} onChange={handleNewVpsChange} required />
                    <input type="number" name="port" placeholder="Port" value={newVps.port} onChange={handleNewVpsChange} required />
                    <input type="text" name="api_key" placeholder="API Key" value={newVps.api_key} onChange={handleNewVpsChange} required />
                    <button type="submit">Add VPS</button>
                </form>
            </div>

            {showInstallGuide && (
                <div className="service-management-commands">
                    <h5>Auto-Install Script</h5>
                    <p>Run this command on your VPS to install the agent:</p>
                    <pre><code>curl -sSL https://raw.githubusercontent.com/maniqofgod/vps-agent/main/install.sh | bash</code></pre>
                </div>
            )}
        </div>
    );
};

export default VPSManager;