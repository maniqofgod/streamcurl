import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom'; // Import Link
import * as api from '../services/api';
import '../css/modules/_admin_page.css';
import VPSModal from '../components/modals/VPSModal';
import EditUserModal from '../components/modals/EditUserModal';
import ApiSettings from '../components/ApiSettings';

const Admin = () => {
    const [users, setUsers] = useState([]);
    const [secrets, setSecrets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
    const [secretFile, setSecretFile] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [isVpsModalOpen, setVpsModalOpen] = useState(false);
    const [selectedUserForVps, setSelectedUserForVps] = useState(null);

    const [isEditUserModalOpen, setEditUserModalOpen] = useState(false);
    const [selectedUserForEdit, setSelectedUserForEdit] = useState(null);


    const fetchAdminData = useCallback(async () => {
        try {
            const usersPromise = api.readUsers();
            const secretsPromise = api.getClientSecrets().catch(err => {
                console.error("Could not fetch client secrets, continuing without them.", err);
                return []; // Return an empty array on failure
            });

            const [usersData, secretsData] = await Promise.all([
                usersPromise,
                secretsPromise
            ]);

            setUsers(usersData);
            setSecrets(secretsData);
            setError('');
        } catch (err) {
            setError('Failed to fetch admin data. Are you logged in as an admin?');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        setIsLoading(true);
        fetchAdminData();
    }, [fetchAdminData]);

    const handleNewUserChange = (e) => {
        const { name, value } = e.target;
        setNewUser(prev => ({ ...prev, [name]: value }));
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUser.username || !newUser.password) {
            setError('Username and password are required.');
            return;
        }
        try {
            await api.createUser(newUser);
            setNewUser({ username: '', password: '', role: 'user' });
            fetchAdminData();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create user.');
            console.error(err);
        }
    };

    const handleSecretFileChange = (e) => {
        setSecretFile(e.target.files[0]);
    };

    const handleUploadSecret = async (e) => {
        e.preventDefault();
        if (!secretFile) {
            setError('Please select a file to upload.');
            return;
        }
        try {
            await api.uploadClientSecret(secretFile);
            setSecretFile(null);
            document.getElementById('secret-file-input').value = '';
            fetchAdminData();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to upload secret file.');
            console.error(err);
        }
    };

    const handleDeleteSecret = async (secretName) => {
        if (window.confirm(`Are you sure you want to delete ${secretName}?`)) {
            try {
                await api.deleteClientSecret(secretName);
                fetchAdminData();
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to delete secret file.');
                console.error(err);
            }
        }
    };

    const openVpsModal = (user) => {
        setSelectedUserForVps(user);
        setVpsModalOpen(true);
    };

    const closeVpsModal = () => {
        setVpsModalOpen(false);
        setSelectedUserForVps(null);
    };

    const openEditUserModal = (user) => {
        setSelectedUserForEdit(user);
        setEditUserModalOpen(true);
    };

    const closeEditUserModal = () => {
        setEditUserModalOpen(false);
        setSelectedUserForEdit(null);
    };

    const handleApproveUser = async (userId) => {
        if (window.confirm('Are you sure you want to approve this user?')) {
            try {
                await api.approveUser(userId);
                fetchAdminData();
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to approve user.');
            }
        }
    };
const handleDeleteUser = async (userId) => {
        if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            try {
                await api.deleteUser(userId);
                fetchAdminData();
            } catch (err) {
                setError(err.response?.data?.detail || 'Failed to delete user.');
            }
        }
    };

    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatStorage = (usageBytes, quotaGb) => {
        if (usageBytes === null || usageBytes === undefined || quotaGb === null || quotaGb === undefined) {
            return 'N/A';
        }
        const usageGb = (usageBytes / 1e9);
        const remainingGb = quotaGb - usageGb;
        return `${usageGb.toFixed(2)} GB / ${quotaGb} GB (${remainingGb.toFixed(2)} GB free)`;
    };

    if (isLoading) {
        return <div className="loading-container">Loading Admin Panel...</div>;
    }

    if (error) {
        return <div className="admin-error">{error}</div>;
    }

    return (
        <div className="admin-page">
            <h1 className="admin-title">Admin Panel</h1>
            <div className="vps-page-container">
                <div className="admin-card">
                    <h2 className="card-title">User Management</h2>
                    
                    <div className="card-section">
                        <h3 className="section-title">Create New User</h3>
                        <form onSubmit={handleCreateUser} className="admin-form">
                            <input type="text" name="username" placeholder="Username" value={newUser.username} onChange={handleNewUserChange} required />
                            <input type="password" name="password" placeholder="Password" value={newUser.password} onChange={handleNewUserChange} required />
                            <select name="role" value={newUser.role} onChange={handleNewUserChange}>
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                            <button type="submit" className="glass-button">Create User</button>
                        </form>
                    </div>

                    <div className="card-section">
                        <h3 className="section-title">Existing Users</h3>
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search for a user..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <div className="user-list-container">
                            <table className="user-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Username</th>
                                        <th>Role</th>
                                        <th>Status</th>
                                        <th>Storage</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map(user => (
                                        <tr key={user.id}>
                                            <td>{user.id}</td>
                                            <td>{user.username}</td>
                                            <td>{user.role}</td>
                                            <td>
                                                <span className={`status-badge ${user.is_active ? 'status-active' : 'status-pending'}`}>
                                                    {user.is_active ? 'Active' : 'Pending'}
                                                </span>
                                            </td>
                                            <td>{formatStorage(user.gdrive_usage_bytes, user.gdrive_quota_gb)}</td>
                                            <td className="actions-cell">
                                                {!user.is_active && (
                                                    <button className="action-btn approve-btn" onClick={() => handleApproveUser(user.id)}>Approve</button>
                                                )}
                                                <button className="action-btn" onClick={() => openEditUserModal(user)}>Edit</button>
                                                <button className="action-btn" onClick={() => openVpsModal(user)}>Manage VPS</button>
                                                <button className="action-btn delete-btn" onClick={() => handleDeleteUser(user.id)}>Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="admin-card">
                    <h2 className="card-title">Integrations & Settings</h2>
                    <div className="card-section">
                        <h3 className="section-title">Google Drive</h3>
                        <p>Manage connection to Google Drive for media storage.</p>
                        <Link to="/admin/gdrive" className="glass-button">
                            Go to Google Drive Settings
                        </Link>
                    </div>
                    <hr/>
                    <h2 className="card-title">YouTube Client Secrets</h2>
                    <div className="card-section">
                        <h3 className="section-title">Upload New Client Secret</h3>
                        <form onSubmit={handleUploadSecret} className="admin-form">
                            <input type="file" id="secret-file-input" onChange={handleSecretFileChange} accept=".json" />
                            <button type="submit" className="glass-button">Upload Secret</button>
                        </form>
                    </div>
                    <div className="card-section">
                        <h3 className="section-title">Uploaded Secrets</h3>
                        <ul className="secret-list">
                            {secrets.map(secret => (
                                <li key={secret}>
                                    <span>{secret}</span>
                                    <button onClick={() => handleDeleteSecret(secret)} className="delete-btn">Delete</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            
            <ApiSettings />

            {isVpsModalOpen && <VPSModal user={selectedUserForVps} onClose={closeVpsModal} onVpsChange={fetchAdminData} />}
            {isEditUserModalOpen && <EditUserModal user={selectedUserForEdit} onClose={closeEditUserModal} onUserUpdate={fetchAdminData} />}
        </div>
    );
};

export default Admin;