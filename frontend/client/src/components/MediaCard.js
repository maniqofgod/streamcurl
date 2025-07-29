import React, { useState } from 'react';

const MediaCard = ({ item, onSelect, onRename, onDelete, isSelected, onDoubleClick }) => {
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const audioRef = React.useRef(null);
    const isGdrive = item.source === 'gdrive';

    const handleSelect = (e) => {
        e.stopPropagation();
        onSelect(item.id, !isSelected);
    };

    const handleRename = (e) => {
        e.stopPropagation();
        const newName = prompt("Enter new name:", item.display_name);
        if (newName && newName !== item.display_name) {
            onRename(item.id, newName);
        }
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete ${item.display_name}?`)) {
            onDelete(item.id);
        }
    };

    const getThumbnail = () => {
        if (item.thumbnail_url) {
            const path = item.thumbnail_url.startsWith('/') ? item.thumbnail_url : `/${item.thumbnail_url}`;
            return path;
        }
        if (item.thumbnail_path) {
            const path = item.thumbnail_path.startsWith('/') ? item.thumbnail_path : `/${item.thumbnail_path}`;
            return path;
        }
        return 'https://via.placeholder.com/150';
    };

    const posterSrc = getThumbnail();

    const formatDuration = (seconds) => {
        if (!seconds || seconds < 0) return '00:00:00';
        return new Date(seconds * 1000).toISOString().substr(11, 8);
    };

    const formatSize = (mb) => {
        if (mb === undefined || mb === null) return '';
        return `${mb.toFixed(2)} MB`;
    }
    
    const toggleAudioPlay = (e) => {
        e.stopPropagation();
        if (audioRef.current) {
            if (isAudioPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsAudioPlaying(!isAudioPlaying);
        }
    };

    const renderMedia = () => {
        const type = item.type || 'File';
        switch (type.toLowerCase()) {
            case 'video':
                return <img src={posterSrc} alt={item.display_name} className="video-poster" />;
            case 'image':
                return <img src={posterSrc} alt={item.display_name} />;
            case 'audio':
                return (
                    <div className="audio-icon-container">
                        <button onClick={toggleAudioPlay} className="audio-play-button">
                            <i className={`fas ${isAudioPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                        </button>
                        <i className="fas fa-file-audio audio-file-icon"></i>
                    </div>
                );
            default:
                return <img src="https://via.placeholder.com/150/808080/FFFFFF?Text=File" alt="File" />;
        }
    };
    
    const getMediaSource = () => {
        if (isGdrive) {
            return `/api/v1/gdrive/stream/${item.id}`;
        }
        const path = item.filepath.startsWith('/') ? item.filepath : `/${item.filepath}`;
        return path;
    };

    return (
        <div
            className={`media-card-v2 ${isSelected ? 'selected' : ''}`}
            onClick={handleSelect}
            onDoubleClick={() => onDoubleClick(item)}
        >
            <div className="card-thumbnail">
                {renderMedia()}
                {item.type?.toLowerCase() === 'audio' && <audio ref={audioRef} src={getMediaSource()} preload="metadata" onEnded={() => setIsAudioPlaying(false)}></audio>}
                <span className="info-duration">{formatDuration(item.duration)}</span>
                <span className="info-filesize">{formatSize(item.size_mb)}</span>
                <div className="card-actions">
                    <button onClick={handleRename}><i className="fas fa-pencil-alt"></i></button>
                    <button onClick={handleDelete}><i className="fas fa-trash-alt"></i></button>
                </div>
            </div>
            <div className="card-content">
                <p className="card-title">{item.display_name}</p>
            </div>
        </div>
    );
};

export default MediaCard;
