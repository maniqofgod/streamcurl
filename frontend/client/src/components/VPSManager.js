import React, { useState } from 'react';
import * as api from '../services/api';

const VPSManager = ({ user, onVpsChange }) => {
    const [newVps, setNewVps] = useState({ name: '', ip_address: '', port: 8001, api_key: '' });
    const [error, setError] = useState('');
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
            onVpsChange(); // Callback to refresh user data in Admin.js
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add VPS.');
            console.error(err);
        }
    };

    const handleDeleteVps = async (vpsId) => {
        if (window.confirm('Are you sure you want to delete this VPS?')) {
            try {
                await api.adminDeleteVps(vpsId);
                onVpsChange(); // Callback to refresh user data
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to delete VPS.');
                console.error(err);
            }
        }
    };

    return (
        <div className="vps-manager">
            <h4>VPS for {user.username}</h4>
            {error && <p className="error">{error}</p>}
            <ul className="vps-list">
                {user.vps && user.vps.map(vps => (
                    <li key={vps.id}>
                        <span>{vps.name} ({vps.ip_address}:{vps.port})</span>
                        <button onClick={() => handleDeleteVps(vps.id)}>Delete</button>
                    </li>
                ))}
            </ul>
            <div className="add-new-vps">
                <h5>Add New VPS</h5>
                <button onClick={() => setShowInstallGuide(!showInstallGuide)} className="show-install-guide-btn">
                    {showInstallGuide ? 'Hide' : 'Show'} Install Guide
                </button>
                <form onSubmit={handleAddVps} className="vps-form">
                    <input
                        type="text"
                        name="name"
                        placeholder="VPS Name"
                        value={newVps.name}
                        onChange={handleNewVpsChange}
                        required
                    />
                    <input
                        type="text"
                        name="ip_address"
                        placeholder="IP Address"
                        value={newVps.ip_address}
                        onChange={handleNewVpsChange}
                        required
                    />
                    <input
                        type="number"
                        name="port"
                        placeholder="Port"
                        value={newVps.port}
                        onChange={handleNewVpsChange}
                        required
                    />
                    <input
                        type="text"
                        name="api_key"
                        placeholder="API Key"
                        value={newVps.api_key}
                        onChange={handleNewVpsChange}
                        required
                    />
                    <button type="submit">Add VPS</button>
                </form>
            </div>

            {showInstallGuide && (
                <div className="service-management-commands">
                    <h5>Service Management Commands</h5>
                    <p>Run these commands on your VPS to manage the agent:</p>
                    <pre>
                        <code>
                            # Start the service<br />
                            sudo systemctl start streamcurl-agent<br /><br />

                            # Stop the service<br />
                            sudo systemctl stop streamcurl-agent<br /><br />

                            # Restart the service<br />
                            sudo systemctl restart streamcurl-agent<br /><br />

                            # Check the status of the service<br />
                            sudo systemctl status streamcurl-agent<br /><br />

                            # View logs<br />
                            sudo journalctl -u streamcurl-agent -f
                        </code>
                    </pre>
                </div>
            )}
        </div>
    );
};

export default VPSManager;