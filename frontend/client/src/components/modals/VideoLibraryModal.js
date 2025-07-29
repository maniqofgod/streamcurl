import React, { useState, useEffect, useCallback } from 'react';
import { getGoogleDriveFiles } from '../../services/api';
import VideoCard from '../VideoCard';
import LoadingSpinner from '../LoadingSpinner';

const VideoLibraryModal = ({ isOpen, onClose, onSave }) => {
    const [videos, setVideos] = useState([]);
    const [selectedVideos, setSelectedVideos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchVideos = useCallback(async () => {
        if (!isOpen) return;
        
        setIsLoading(true);
        setError(null);
        try {
            const allFiles = await getGoogleDriveFiles();
            // Ensure we are filtering based on the correct property from the backend (mime_type)
            const videoFiles = allFiles.filter(file => file.mime_type && file.mime_type.startsWith('video/'));
            const sortedVideos = videoFiles.sort((a, b) => a.display_name.localeCompare(b.display_name));
            setVideos(sortedVideos);
        } catch (err) {
            console.error("Error fetching Google Drive videos:", err);
            setError("Failed to load videos from Google Drive. Please check your connection and permissions.");
        } finally {
            setIsLoading(false);
        }
    }, [isOpen]);

    useEffect(() => {
        fetchVideos();
    }, [fetchVideos]);

    const handleToggleSelect = (video) => {
        setSelectedVideos(prevSelected => {
            const isSelected = prevSelected.some(v => v.id === video.id);
            if (isSelected) {
                return prevSelected.filter(v => v.id !== video.id);
            } else {
                return [...prevSelected, video];
            }
        });
    };

    const handleSave = () => {
        onSave(selectedVideos);
        onClose();
        setSelectedVideos([]); // Reset selection after saving
    };

    const handleClose = () => {
        onClose();
        setSelectedVideos([]); // Reset selection on close
    };

    if (!isOpen) {
        return null;
    }

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSpinner />;
        }

        if (error) {
            return <div className="modal-error-message">{error}</div>;
        }

        if (videos.length === 0) {
            return <div className="modal-empty-message">No videos found in your Google Drive.</div>;
        }

        return (
            <div className="video-grid">
                {videos.map(video => (
                    <div key={video.id} className="video-grid-item" onClick={() => handleToggleSelect(video)}>
                        <VideoCard
                            video={video}
                            isSelected={selectedVideos.some(v => v.id === video.id)}
                            // Dummy functions as VideoCard expects them, but we handle logic here
                            onSelect={() => handleToggleSelect(video)}
                            onRename={() => {}}
                            onDelete={() => {}}
                            onDoubleClick={() => {}}
                        />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content large">
                <div className="modal-header">
                    <h2>Google Drive Library</h2>
                    <button onClick={handleClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    {renderContent()}
                </div>
                <div className="modal-footer">
                    <button onClick={handleClose} className="modal-btn">Cancel</button>
                    <button onClick={handleSave} className="modal-btn primary" disabled={selectedVideos.length === 0}>
                        Add {selectedVideos.length > 0 ? `(${selectedVideos.length})` : ''} Selected
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoLibraryModal;
