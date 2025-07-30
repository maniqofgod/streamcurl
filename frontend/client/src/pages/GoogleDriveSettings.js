import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import '../css/modules/_admin_page.css'; // Re-use some styles

const GoogleDriveSettings = () => {
    const [status, setStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [credentialsJson, setCredentialsJson] = useState('');
    const [folderId, setFolderId] = useState('');

    const fetchStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/gdrive/status');
            setStatus(response.data);
            if (response.data.drive_folder_id) {
                setFolderId(response.data.drive_folder_id);
            }
        } catch (error) {
            console.error("Failed to fetch Google Drive status", error);
            alert("Could not fetch Google Drive status.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleSaveCredentials = async () => {
        if (!credentialsJson) {
            alert("Please paste your credentials.json content.");
            return;
        }
        setIsLoading(true);
        try {
            const formData = new FormData();
            const blob = new Blob([credentialsJson], { type: 'application/json' });
            formData.append('file', blob, 'credentials.json');

            await api.post('/gdrive/save-credentials', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            alert("Credentials saved. Please connect your account.");
            setCredentialsJson('');
            fetchStatus();
        } catch (error) {
            console.error("Failed to save credentials", error);
            alert("Failed to save credentials.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = async () => {
        try {
            const response = await api.get('/gdrive/auth/url');
            const { auth_url } = response.data;
            // Open the authentication URL in a new tab
            window.open(auth_url, '_blank', 'noopener,noreferrer');
            alert("Please complete the authentication in the new tab. This page will not update automatically; please refresh after authenticating.");
        } catch (error) {
            console.error("Failed to get auth URL", error);
            alert("Could not start connection process. Have you saved your credentials?");
        }
    };
    
    const handleDisconnect = async () => {
        if (!window.confirm("Are you sure you want to disconnect from Google Drive?")) {
            return;
        }
        setIsLoading(true);
        try {
            await api.post('/gdrive/disconnect');
            alert("Successfully disconnected.");
            fetchStatus();
        } catch (error) {
            console.error("Failed to disconnect", error);
            alert("Failed to disconnect.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetFolderId = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await api.post('/gdrive/set-folder', { folder_id: folderId });
            alert("Folder ID updated successfully.");
            fetchStatus();
        } catch (error) {
            console.error("Failed to set folder ID", error);
            alert("Failed to set folder ID.");
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && !status) {
        return <LoadingSpinner />;
    }

    return (
        <div className="admin-page">
            <h1>Google Drive Integration</h1>
            <div className="card">
                <h2>Connection Status</h2>
                {isLoading && <LoadingSpinner />}
                {status && (
                    <p>
                        Status: <span className={status.status === 'connected' ? 'status-live' : 'status-idle'}>
                            {status.status === 'connected' ? `Connected as ${status.email}` : 'Disconnected'}
                        </span>
                    </p>
                )}
                {status?.status === 'connected' ? (
                    <button onClick={handleDisconnect} className="modal-btn-danger">Disconnect</button>
                ) : (
                    <button onClick={handleConnect} className="modal-btn">Connect Account</button>
                )}
            </div>

            <div className="card">
                <h2>Configuration</h2>
                <div className="form-group">
                    <label htmlFor="credentials">1. Paste Credentials JSON</label>
                    <p className="help-text">
                        Obtain your credentials from the Google Cloud Console and paste the entire JSON content below.
                    </p>
                    <textarea
                        id="credentials"
                        rows="10"
                        value={credentialsJson}
                        onChange={(e) => setCredentialsJson(e.target.value)}
                        placeholder='Paste your credentials.json content here'
                        style={{width: '100%', boxSizing: 'border-box'}}
                    />
                    <button onClick={handleSaveCredentials} disabled={!credentialsJson || isLoading} className="modal-btn">Save Credentials</button>
                </div>
                <hr />
                <form className="form-group" onSubmit={handleSetFolderId}>
                    <label htmlFor="folderId">2. Set Drive Folder ID</label>
                    <p className="help-text">Create a folder in Google Drive and paste its ID here. The ID is the last part of the folder's URL.</p>
                    <input
                        type="text"
                        id="folderId"
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                        placeholder="e.g., 1a2b3c4d5e6f7g8h9i0j"
                        required
                    />
                    <button type="submit" disabled={isLoading} className="modal-btn">Save Folder ID</button>
                </form>
            </div>
        </div>
    );
};

export default GoogleDriveSettings;
