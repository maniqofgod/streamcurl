import React, { useState } from 'react';
import * as api from '../../services/api';
import '../../css/modules/_modal.css';

const VPSModal = ({ user, onClose, onVpsChange }) => {
    const [newVps, setNewVps] = useState({ name: '', ip_address: '', port: 8001, api_key: '' });
    const [error, setError] = useState('');

    const handleNewVpsChange = (e) => {
        const { name, value } = e.target;
        setNewVps(prev => ({ ...prev, [name]: value }));
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

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Manage VPS for {user.username}</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    {error && <p className="error-message">{error}</p>}
                    
                    <div className="vps-management-container">
                        <div className="vps-panel">
                            <h4>Add New VPS</h4>
                            <form onSubmit={handleAddVps} className="vps-form-modal">
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
                                <button type="submit" className="add-btn-modal">Add VPS</button>
                            </form>
                        </div>
                        <div className="vps-panel">
                            <h4>My VPS List</h4>
                            <ul className="vps-list-modal">
                                {user.vps && user.vps.length > 0 ? user.vps.map(vps => (
                                    <li key={vps.id}>
                                        <span>{vps.name} ({vps.ip_address}:{vps.port})</span>
                                        <button onClick={() => handleDeleteVps(vps.id)} className="delete-btn-modal">Delete</button>
                                    </li>
                                )) : (
                                    <p>No VPS assigned to this user.</p>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VPSModal;