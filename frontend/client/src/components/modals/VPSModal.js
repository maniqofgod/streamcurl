import React, { useState, useEffect } from 'react';
import '../../css/modules/_modal.css';
import * as api from '../../services/api';

const VPSModal = ({ user, onClose, onVpsAdded, vpsToEdit, onVpsUpdated }) => {
    const [vpsDetails, setVpsDetails] = useState({
        name: '',
        ip_address: '',
        port: 8002,
        api_key: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const isEditMode = Boolean(vpsToEdit);

    useEffect(() => {
        if (isEditMode) {
            setVpsDetails({
                name: vpsToEdit.name || '',
                ip_address: vpsToEdit.ip_address || '',
                port: vpsToEdit.port || 8002,
                api_key: vpsToEdit.api_key || ''
            });
        }
    }, [vpsToEdit, isEditMode]);

    const installCommand = "curl -sL https://raw.githubusercontent.com/maniqofgod/vps_agent/main/install.sh | bash";

    const handleChange = (e) => {
        const { name, value } = e.target;
        setVpsDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!vpsDetails.name || !vpsDetails.ip_address || !vpsDetails.port) {
            setError('Name, IP Address, and Port are required.');
            return;
        }
        if (!user || !user.id) {
            setError('Cannot process VPS without a user context.');
            return;
        }
        setError('');
        setIsLoading(true);

        try {
            const payload = {
                ...vpsDetails,
                port: parseInt(vpsDetails.port, 10),
                user_id: user.id
            };

            if (isEditMode) {
                await api.updateVps(vpsToEdit.id, payload);
                onVpsUpdated();
            } else {
                await api.createVps(payload);
                onVpsAdded();
            }
            onClose();
        } catch (err) {
            const errorMessage = err.response?.data?.detail || `Failed to ${isEditMode ? 'update' : 'add'} VPS worker.`;
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };
    
    const copyToClipboard = () => {
        navigator.clipboard.writeText(installCommand).then(() => {
            alert('Command copied to clipboard!');
        }, (err) => {
            alert('Failed to copy command.');
        });
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{isEditMode ? 'Edit' : 'Add New'} VPS Worker</h2>
                    <button onClick={onClose} className="close-btn" disabled={isLoading}>&times;</button>
                </div>
                <div className="modal-body">
                    {error && <p className="error-message">{error}</p>}
                    
                    {!isEditMode && (
                        <>
                            <h4>1. Install Agent on Your VPS</h4>
                            <p>Run this command on your new VPS server to install the agent. It will display an API Key upon completion.</p>
                            <div className="command-box">
                                <code>{installCommand}</code>
                                <button onClick={copyToClipboard} className="copy-btn">Copy</button>
                            </div>
                            <hr className="modal-divider" />
                        </>
                    )}

                    <h4>{isEditMode ? 'VPS Worker Details' : '2. Add VPS Worker Details'}</h4>
                    <form onSubmit={handleSubmit} className="vps-form-modal-unified">
                        <fieldset disabled={isLoading}>
                            <div className="form-group">
                                <label htmlFor="name">Worker Name</label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    placeholder="e.g., My First Worker"
                                    value={vpsDetails.name}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="form-group-inline">
                                <div className="form-group">
                                    <label htmlFor="ip_address">VPS IP Address</label>
                                    <input
                                        type="text"
                                        id="ip_address"
                                        name="ip_address"
                                        placeholder="123.45.67.89"
                                        value={vpsDetails.ip_address}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="port">Agent Port</label>
                                    <input
                                        type="number"
                                        id="port"
                                        name="port"
                                        placeholder="8002"
                                        value={vpsDetails.port}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="api_key">API Key {isEditMode && '(Leave blank to keep unchanged)'}</label>
                                <input
                                    type="text"
                                    id="api_key"
                                    name="api_key"
                                    placeholder={isEditMode ? "Enter new API key if needed" : "API Key from Step 1"}
                                    value={vpsDetails.api_key}
                                    onChange={handleChange}
                                    required={!isEditMode}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={isLoading}>
                                {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Worker' : 'Add Worker')}
                            </button>
                        </fieldset>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default VPSModal;