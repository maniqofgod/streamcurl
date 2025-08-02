import React, { useState } from 'react';
import * as api from '../../services/api';
import '../../css/modules/_modal.css';

const AdminVPSModal = ({ user, onClose, onVpsChange }) => {
    const [newVps, setNewVps] = useState({ name: '', ip_address: '', port: 8002, api_key: '' });
    const [error, setError] = useState('');
    const [testResults, setTestResults] = useState({});
    const [managementOutput, setManagementOutput] = useState({});

    const installCommand = "curl -sL https://raw.githubusercontent.com/maniqofgod/vps_agent/main/install.sh | bash";

    const handleNewVpsChange = (e) => {
        const { name, value } = e.target;
        setNewVps(prev => ({ ...prev, [name]: value }));
    };

    const handleAddVps = async (e) => {
        e.preventDefault();
        if (!newVps.name || !newVps.ip_address || !newVps.port || !newVps.api_key) {
            setError('All fields are required.');
            return;
        }
        try {
            await api.adminCreateVpsForUser(user.id, {
                ...newVps,
                port: parseInt(newVps.port, 10)
            });
            setNewVps({ name: '', ip_address: '', port: 8002, api_key: '' });
            setError('');
            onVpsChange(); 
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add VPS worker.');
        }
    };

    const handleDeleteVps = async (vpsId) => {
        if (window.confirm('Are you sure you want to delete this VPS worker?')) {
            try {
                await api.adminDeleteVps(vpsId);
                onVpsChange();
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to delete VPS.');
            }
        }
    };

    const handleTestConnection = async (vpsId) => {
        setTestResults(prev => ({ ...prev, [vpsId]: { loading: true, result: null } }));
        try {
            const result = await api.testVpsConnection(vpsId);
            setTestResults(prev => ({ ...prev, [vpsId]: { loading: false, result } }));
        } catch (err) {
            const result = {
                connection: {
                    status: 'failure',
                    details: err.response?.data?.detail || 'An unknown error occurred.'
                }
            };
            setTestResults(prev => ({ ...prev, [vpsId]: { loading: false, result } }));
        }
    };

    const handleManageCommand = async (vpsId, command) => {
        setManagementOutput(prev => ({ ...prev, [vpsId]: { loading: true, output: `Running ${command}...` } }));
        try {
            const result = await api.manageVpsAgent(vpsId, { command });
            // Pastikan output adalah string
            const outputText = typeof result.output === 'object' ? JSON.stringify(result.output, null, 2) : result.output;
            setManagementOutput(prev => ({ ...prev, [vpsId]: { loading: false, output: outputText } }));
        } catch (err) {
            const errorText = err.response?.data?.detail || `Failed to run ${command}.`;
            setManagementOutput(prev => ({ ...prev, [vpsId]: { loading: false, output: errorText } }));
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(installCommand).then(() => {
            alert('Command copied to clipboard!');
        }, (err) => {
            alert('Failed to copy command.');
        });
    };

    const renderTestResult = (vpsId) => {
        const test = testResults[vpsId];
        if (!test) return null;
        if (test.loading) return <small>Testing...</small>;

        const { result } = test;
        if (!result || !result.connection) {
            return <small className="error">Test failed: No result.</small>;
        }

        if (result.connection.status === 'success') {
            // Pastikan details adalah string sebelum di-render
            const detailsText = typeof result.connection.details === 'object' 
                ? JSON.stringify(result.connection.details) 
                : result.connection.details;
            return <small className="success">Success: {detailsText}</small>;
        } else {
            // Pastikan details adalah string sebelum di-render
            const detailsText = typeof result.connection.details === 'object' 
                ? JSON.stringify(result.connection.details) 
                : result.connection.details;
            return <small className="error">Failed: {detailsText}</small>;
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Manage VPS Workers for {user.username}</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    {error && <p className="error-message">{error}</p>}
                    
                    <h4>Add New Worker</h4>
                    <p>First, run this command on the new VPS to install the agent, then add the details below.</p>
                    <div className="command-box">
                        <code>{installCommand}</code>
                        <button onClick={copyToClipboard} className="copy-btn">Copy</button>
                    </div>
                    <form onSubmit={handleAddVps} className="vps-form-modal-unified">
                        <input type="text" name="name" placeholder="Worker Name" value={newVps.name} onChange={handleNewVpsChange} required />
                        <input type="text" name="ip_address" placeholder="VPS IP Address" value={newVps.ip_address} onChange={handleNewVpsChange} required />
                        <input type="number" name="port" placeholder="Port" value={newVps.port} onChange={handleNewVpsChange} required />
                        <input type="text" name="api_key" placeholder="API Key" value={newVps.api_key} onChange={handleNewVpsChange} required />
                        <button type="submit" className="add-btn-modal">Add Worker</button>
                    </form>

                    <hr className="modal-divider" />

                    <h4>Assigned VPS Workers</h4>
                    <ul className="vps-list-modal">
                        {Array.isArray(user.vps) && user.vps.length > 0 ? user.vps.map(vps => (
                            <li key={vps.id}>
                                <div className="vps-info">
                                    <span>{vps.name} ({vps.ip_address}:{vps.port})</span>
                                    <div className="test-result">
                                        {renderTestResult(vps.id)}
                                    </div>
                                </div>
                                <div className="vps-actions">
                                    <button onClick={() => handleManageCommand(vps.id, 'status')} className="manage-btn-modal" disabled={managementOutput[vps.id]?.loading}>Status</button>
                                    <button onClick={() => handleManageCommand(vps.id, 'logs')} className="manage-btn-modal" disabled={managementOutput[vps.id]?.loading}>Logs</button>
                                    <button onClick={() => handleManageCommand(vps.id, 'restart')} className="manage-btn-modal" disabled={managementOutput[vps.id]?.loading}>Restart</button>
                                    <button onClick={() => handleManageCommand(vps.id, 'stop')} className="manage-btn-modal delete" disabled={managementOutput[vps.id]?.loading}>Stop</button>
                                    <button onClick={() => handleDeleteVps(vps.id)} className="delete-btn-modal">Delete</button>
                                </div>
                                {managementOutput[vps.id] && (
                                    <div className="management-output-modal">
                                        <pre>{managementOutput[vps.id].output}</pre>
                                    </div>
                                )}
                            </li>
                        )) : (
                            <p>No VPS workers assigned to this user.</p>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default AdminVPSModal;