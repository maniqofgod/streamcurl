import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import * as api from '../services/api';
import '../css/modules/_admin_page.css'; // Reusing some styles

const AccountSettings = () => {
    const { user: currentUser, setUser: setCurrentUser } = useOutletContext();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profilePictureFile, setProfilePictureFile] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }
        if (!newPassword || !currentPassword) {
            setError('All password fields are required.');
            return;
        }

        try {
            await api.changePassword(currentPassword, newPassword);
            setMessage('Password updated successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            let errorMsg = 'Failed to change password.';
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
            setError(errorMsg);
        }
    };

    const handlePictureChange = (e) => {
        setProfilePictureFile(e.target.files[0]);
    };

    const handlePictureUpload = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!profilePictureFile) {
            setError('Please select a file to upload.');
            return;
        }

        try {
            const updatedUser = await api.uploadProfilePicture(profilePictureFile);
            setCurrentUser(updatedUser);
            setMessage('Profile picture updated successfully!');
            setProfilePictureFile(null);
            document.getElementById('picture-file-input').value = '';
        } catch (err) {
            let errorMsg = 'Failed to upload profile picture.';
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
            setError(errorMsg);
        }
    };

    if (!currentUser) {
        return <div>Loading...</div>;
    }

    return (
        <div className="admin-page">
            <h1 className="admin-title">Account Settings</h1>

            {message && <div className="form-message success">{message}</div>}
            {error && <div className="form-message error">{error}</div>}

            <div className="vps-page-container">
                <div className="admin-card">
                    <h2 className="card-title">Profile Picture</h2>
                    <div className="card-section">
                        {currentUser.profile_image_url && (
                            <img 
                                src={`${process.env.REACT_APP_API_URL || ''}${currentUser.profile_image_url}`} 
                                alt="Profile" 
                                className="profile-picture-preview"
                            />
                        )}
                        <form onSubmit={handlePictureUpload} className="admin-form">
                            <input type="file" id="picture-file-input" onChange={handlePictureChange} accept="image/*" />
                            <button type="submit" className="glass-button">Upload New Picture</button>
                        </form>
                    </div>
                </div>

                <div className="admin-card">
                    <h2 className="card-title">Change Password</h2>
                    <div className="card-section">
                        <form onSubmit={handlePasswordChange} className="admin-form">
                            <input 
                                type="password" 
                                placeholder="Current Password" 
                                value={currentPassword} 
                                onChange={(e) => setCurrentPassword(e.target.value)} 
                                required 
                            />
                            <input 
                                type="password" 
                                placeholder="New Password" 
                                value={newPassword} 
                                onChange={(e) => setNewPassword(e.target.value)} 
                                required 
                            />
                            <input 
                                type="password" 
                                placeholder="Confirm New Password" 
                                value={confirmPassword} 
                                onChange={(e) => setConfirmPassword(e.target.value)} 
                                required 
                            />
                            <button type="submit" className="glass-button">Change Password</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountSettings;