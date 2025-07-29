import React from 'react';
import './VideoCard.css';

const VideoCard = ({ video, onSelect, onRename, onDelete, isSelected, onDoubleClick }) => {
    const handleSelect = (e) => {
        e.stopPropagation();
        onSelect(video.id, !isSelected);
    };

    const handleRename = (e) => {
        e.stopPropagation();
        const newName = prompt("Enter new name for the video:", video.display_name);
        if (newName) {
            onRename(video.id, newName);
        }
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete ${video.display_name}?`)) {
            onDelete(video.id);
        }
    };

    const getMediaSource = (type) => {
        const isGdrive = video.source === 'gdrive' || video.storage_type === 'gdrive';
        const token = localStorage.getItem('access_token');
        let url;

        if (isGdrive) {
            if (type === 'thumbnail') {
                url = `/api/v1/gdrive/thumbnail/${video.id}`;
            } else {
                url = `/api/v1/gdrive/stream/${video.id}`;
            }
            if (token) {
                const separator = url.includes('?') ? '&' : '?';
                url = `${url}${separator}token=${token}`;
            }
        } else {
            // For local files, the path should be relative to the public folder or handled by a static server
            if (type === 'thumbnail') {
                url = video.thumbnail_path ? `/${video.thumbnail_path}` : '';
            } else {
                url = video.filepath ? `/${video.filepath}` : '';
            }
        }
        return url;
    };

    const videoSrc = getMediaSource('video');
    const posterSrc = getMediaSource('thumbnail');

    return (
        <div className={`video-card ${isSelected ? 'selected' : ''}`} onClick={(e) => handleSelect(e)} onDoubleClick={() => onDoubleClick(video)}>
            <div className="video-thumbnail">
                <video preload="metadata" poster={posterSrc} src={videoSrc} />
            </div>
            <div className="video-info">
                <p className="video-name">{video.display_name}</p>
                <div className="video-actions">
                    <button onClick={handleRename}>Rename</button>
                    <button onClick={handleDelete}>Delete</button>
                </div>
            </div>
        </div>
    );
};

export default VideoCard;