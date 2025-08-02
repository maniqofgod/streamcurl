import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import VPSModal from '../components/modals/VPSModal';
import '../css/modules/_admin_page.css';

const VPSPage = () => {
    const [vpsList, setVpsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [vpsToEdit, setVpsToEdit] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [error, setError] = useState('');
    const [testLogs, setTestLogs] = useState({});
    const [testingVpsId, setTestingVpsId] = useState(null);
    const [managementOutput, setManagementOutput] = useState({});
    const [managingVpsId, setManagingVpsId] = useState(null);

    const fetchInitialData = useCallback(async () => {
        try {
            setLoading(true);
            const user = await api.getCurrentUser();
            setCurrentUser(user);
            
            const vpsData = await api.readVpsList();
            setVpsList(vpsData);

        } catch (error) {
            console.error("Error fetching initial data:", error);
            setError('Failed to load data. Please try again.');
            setVpsList([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    const handleOpenAddModal = () => {
        if (!currentUser) {
            alert("Cannot open modal: current user data is not loaded.");
            return;
        }
        setVpsToEdit(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (vps) => {
        if (!currentUser) {
            alert("Cannot open modal: current user data is not loaded.");
            return;
        }
        setVpsToEdit(vps);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setVpsToEdit(null);
    };

    const handleDelete = async (vpsId) => {
        if (window.confirm("Are you sure you want to delete this VPS?")) {
            try {
                await api.deleteVps(vpsId);
                fetchInitialData(); // Refresh data
            } catch (error) {
                alert("Failed to delete VPS.");
            }
        }
    };

    const handleTestNetwork = async (vpsId) => {
        setTestingVpsId(vpsId);
        setTestLogs(prev => ({ ...prev, [vpsId]: "Testing network... please wait." }));
        try {
            const result = await api.testVpsConnection(vpsId);
            const logOutput = `Network Test Result:\nStatus: ${result.connection.status}\nDetails: ${JSON.stringify(result.connection.details, null, 2)}`;
            setTestLogs(prev => ({ ...prev, [vpsId]: logOutput }));
        } catch (error) {
            const errorMessage = error.response?.data?.detail || "Failed to test network.";
            setTestLogs(prev => ({ ...prev, [vpsId]: `Network Test Failed: ${errorMessage}` }));
        }
    };

    const handleTestStreaming = async (vpsId) => {
        setTestingVpsId(vpsId);
        setTestLogs(prev => ({ ...prev, [vpsId]: "Testing streaming capabilities... this may take a moment." }));
        try {
            const result = await api.testVpsStreaming(vpsId);
            const logOutput = `Streaming Test Result:\nStatus: ${result.details.status}\nReturn Code: ${result.details.return_code}\n\n--- Logs ---\n${result.details.logs}`;
            setTestLogs(prev => ({ ...prev, [vpsId]: logOutput }));
        } catch (error) {
            const errorMessage = error.response?.data?.detail || "Failed to test streaming.";
            setTestLogs(prev => ({ ...prev, [vpsId]: `Streaming Test Failed: ${errorMessage}` }));
        }
    };

    const handleManageCommand = async (vpsId, command) => {
        setManagingVpsId(vpsId);
        setManagementOutput(prev => ({ ...prev, [vpsId]: `Running ${command}...` }));
        try {
            // Perlu diketahui bahwa endpoint di backend mengharapkan objek, bukan hanya string
            const result = await api.manageVpsAgent(vpsId, { command });
            const outputText = typeof result.output === 'object' ? JSON.stringify(result.output, null, 2) : result.output;
            setManagementOutput(prev => ({ ...prev, [vpsId]: outputText }));
        } catch (error) {
            const errorMessage = error.response?.data?.detail || `Failed to run command ${command}.`;
            setManagementOutput(prev => ({ ...prev, [vpsId]: `Command Failed: ${errorMessage}` }));
        }
    };

    return (
        <div className="admin-page">
            <h1 className="admin-title">Manage My VPS</h1>
            
            <div className="admin-card">
                <div className="card-title">
                    <button onClick={handleOpenAddModal} className="glass-button-small">Add New VPS</button>
                </div>
                
                <div className="card-section">
                    {loading ? (
                        <LoadingSpinner />
                    ) : error ? (
                        <div className="error-message">{error}</div>
                    ) : (
                        <div className="user-list-container">
                            {vpsList && vpsList.length > 0 ? (
                                <div className="vps-cards-container">
                                    {vpsList.map((vps) => (
                                        <div className="vps-card" key={vps.id}>
                                            <div className="vps-card-header">
                                                <span className="vps-card-name">{vps.name} (ID: {vps.id})</span>
                                                <span className="vps-card-ip">{vps.ip_address}:{vps.port}</span>
                                            </div>
                                            <div className="vps-card-actions">
                                                <button onClick={() => handleOpenEditModal(vps)} className="action-btn">Edit</button>
                                                <button onClick={() => handleManageCommand(vps.id, 'status')} className="action-btn">Status</button>
                                                <button onClick={() => handleManageCommand(vps.id, 'logs')} className="action-btn">Logs</button>
                                                <button onClick={() => handleManageCommand(vps.id, 'restart')} className="action-btn">Restart</button>
                                                <button onClick={() => handleManageCommand(vps.id, 'stop')} className="action-btn delete-btn">Stop</button>
                                                <button onClick={() => handleDelete(vps.id)} className="action-btn delete-btn">Delete</button>
                                            </div>
                                            {managingVpsId === vps.id && (
                                                <div className="management-output">
                                                    <pre>{managementOutput[vps.id]}</pre>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="no-data-message">
                                    <p>No VPS workers found.</p>
                                    <p>Click "Add New VPS" to get started.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <VPSModal
                    user={currentUser}
                    onClose={handleCloseModal}
                    onVpsAdded={fetchInitialData}
                    vpsToEdit={vpsToEdit}
                    onVpsUpdated={fetchInitialData}
                />
            )}
        </div>
    );
};

export default VPSPage;