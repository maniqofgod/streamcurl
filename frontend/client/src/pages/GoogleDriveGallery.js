import React, { useState, useEffect, useCallback } from 'react';
import { getGoogleDriveFiles, deleteGoogleDriveFile, renameGoogleDriveFile, getUserContext } from '../services/api';
import MediaCard from '../components/MediaCard';
import UploadMediaModal from '../components/modals/UploadMediaModal';
import MediaPreviewModal from '../components/modals/MediaPreviewModal'; // Import the new modal
import '../css/modules/_gallery_page.css';

const GoogleDriveGallery = () => {
    const [media, setMedia] = useState([]);
    const [selectedMedia, setSelectedMedia] = useState([]);
    const [mediaType, setMediaType] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isUploadModalOpen, setUploadModalOpen] = useState(false);
    const [userContext, setUserContext] = useState(null);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [previewingMedia, setPreviewingMedia] = useState(null); // State for the preview modal

    const fetchUserContext = useCallback(async () => {
        try {
            const context = await getUserContext();
            setUserContext(context);
            if (!selectedUserId) {
                setSelectedUserId(context.user.id);
            }
        } catch (err) {
            setError('Failed to fetch user context.');
            console.error(err);
        }
    }, [selectedUserId]);

    useEffect(() => {
        fetchUserContext();
    }, [fetchUserContext]);

    const fetchMedia = useCallback(async () => {
        if (!selectedUserId) return;
        setLoading(true);
        setError(null);
        try {
            const userIdToSend = userContext?.user.is_superuser ? selectedUserId : null;
            const data = await getGoogleDriveFiles(mediaType, userIdToSend);
            setMedia(data);
        } catch (err) {
            setError(err.response?.data?.detail || `Failed to fetch ${mediaType} files from Google Drive.`);
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [mediaType, selectedUserId, userContext?.user.is_superuser]);

    useEffect(() => {
        fetchMedia();
    }, [fetchMedia]);

    const handleUploadComplete = () => {
        setUploadModalOpen(false);
        fetchMedia();
        fetchUserContext(); // Refresh storage info
    };

    const handleSelectMedia = (mediaId, isSelected) => {
        if (isSelected) {
            setSelectedMedia(prev => [...prev, mediaId]);
        } else {
            setSelectedMedia(prev => prev.filter(id => id !== mediaId));
        }
    };

    const handleRenameMedia = async (mediaId, newName) => {
        try {
            await renameGoogleDriveFile(mediaId, newName, selectedUserId);
            fetchMedia();
        } catch (error) {
            console.error('Error renaming media:', error);
            alert('Failed to rename file.');
        }
    };

    const handleDeleteMedia = async (mediaId) => {
        try {
            await deleteGoogleDriveFile(mediaId, selectedUserId);
            fetchMedia();
        } catch (error) {
            console.error('Error deleting media:', error);
            alert('Failed to delete file.');
        }
    };

    const handleDoubleClickMedia = (mediaItem) => {
        setPreviewingMedia(mediaItem);
    };

    const handleClosePreview = () => {
        setPreviewingMedia(null);
    };

    const formatStorage = (usageBytes, quotaGb) => {
        if (usageBytes === null || usageBytes === undefined || quotaGb === null || quotaGb === undefined) {
            return 'N/A';
        }
        const usageGb = (usageBytes / 1e9);
        const remainingGb = quotaGb - usageGb;
        return `Used: ${usageGb.toFixed(2)} GB | Free: ${remainingGb.toFixed(2)} GB | Total: ${quotaGb} GB`;
    };
    
    const getSelectedUserStorageInfo = () => {
        if (!userContext || !selectedUserId) return null;
        const selectedUser = userContext.users.find(u => u.id === parseInt(selectedUserId));
        return selectedUser || userContext.user;
    };

    const storageInfo = getSelectedUserStorageInfo();

    return (
        <div className="gallery-page">
            <div className="gallery-header">
                <div className="media-type-toggle">
                    <button onClick={() => setMediaType('all')} className={mediaType === 'all' ? 'active' : ''}>All</button>
                    <button onClick={() => setMediaType('video')} className={mediaType === 'video' ? 'active' : ''}>Videos</button>
                    <button onClick={() => setMediaType('image')} className={mediaType === 'image' ? 'active' : ''}>Images</button>
                    <button onClick={() => setMediaType('audio')} className={mediaType === 'audio' ? 'active' : ''}>Audio</button>
                </div>
                <div className="page-controls">
                    <button className="btn btn-primary" onClick={() => setUploadModalOpen(true)}>
                        <i className="fas fa-upload"></i> Upload to Drive
                    </button>
                </div>
            </div>

            {userContext && (
                <div className="storage-info">
                    {userContext.user.is_superuser && (
                        <div className="user-selector">
                            
                            <select id="user-select" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                                {userContext.users.map(user => (
                                    <option key={user.id} value={user.id}>{user.username}</option>
                                ))}
                            </select>
                            <button onClick={() => fetchUserContext()} className="btn btn-secondary btn-sm ml-2">
                                <i className="fas fa-sync-alt"></i>
                            </button>
                        </div>
                    )}
                    {storageInfo && <p>{formatStorage(storageInfo.gdrive_usage_bytes, storageInfo.gdrive_quota_gb)}</p>}
                </div>
            )}

            {loading && <p>Loading...</p>}
            {error && <p className="error-text">{error}</p>}
            
            {!loading && !error && (
                <div className="media-grid">
                    {media.map(item => (
                        <MediaCard
                            key={item.gdrive_id}
                            item={{...item, id: item.gdrive_id}}
                            onSelect={handleSelectMedia}
                            onRename={handleRenameMedia}
                            onDelete={handleDeleteMedia}
                            isSelected={selectedMedia.includes(item.gdrive_id)}
                            onDoubleClick={handleDoubleClickMedia}
                        />
                    ))}
                </div>
            )}

            {isUploadModalOpen && (
                <UploadMediaModal
                    onClose={() => setUploadModalOpen(false)}
                    onUploadComplete={handleUploadComplete}
                />
            )}

            {previewingMedia && (
                <MediaPreviewModal
                    media={previewingMedia}
                    onClose={handleClosePreview}
                />
            )}
        </div>
    );
};

export default GoogleDriveGallery;