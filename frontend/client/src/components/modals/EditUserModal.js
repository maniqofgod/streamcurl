import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';
import '../../css/modules/_modal.css';

const EditUserModal = ({ user, onClose, onUserUpdate }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (user) {
            setUsername(user.username);
        }
    }, [user]);

    if (!user) return null;

    const parseErrorMessage = (err) => {
        let errorMsg = 'An unknown error occurred.';
        try {
            const errorDetail = err.response?.data?.detail;
            if (typeof errorDetail === 'string') {
                errorMsg = errorDetail;
            } else if (Array.isArray(errorDetail)) {
                errorMsg = errorDetail.map(e => e.msg || JSON.stringify(e)).join(', ');
            } else if (typeof errorDetail === 'object' && errorDetail !== null) {
                errorMsg = errorDetail.msg || JSON.stringify(errorDetail);
            }
        } catch (parseError) {
            errorMsg = 'An error occurred while parsing the server response.';
        }
        return errorMsg;
    };

    const handleUpdateUsername = async () => {
        if (!username.trim()) {
            setError('Username cannot be empty.');
            return;
        }
        try {
            await api.updateUser(user.id, { username });
            onUserUpdate(); // Refresh user list
            setError('');
        } catch (err) {
            setError(parseErrorMessage(err));
        }
    };

    const handleUpdatePassword = async () => {
        if (!password) {
            setError('Password cannot be empty.');
            return;
        }
        try {
            await api.updateUserPassword(user.id, password);
            setPassword('');
            onUserUpdate(); // Refresh user list
            alert('Password updated successfully!');
            setError('');
        } catch (err) {
            setError(parseErrorMessage(err));
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Edit User: {user.username}</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    {error && <p className="error-message">{error}</p>}
                    
                    <div className="form-group-modal">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <hr />

                    <div className="form-group-modal">
                        <label htmlFor="password">New Password</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="Enter new password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                </div>
                <div className="modal-footer">
                    <button onClick={handleUpdateUsername} className="modal-btn">Update Username</button>
                    <button onClick={handleUpdatePassword} className="modal-btn">Update Password</button>
                </div>
            </div>
        </div>
    );
};

export default EditUserModal;