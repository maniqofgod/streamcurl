import React from 'react';
import '../../css/modules/_media_preview_modal.css';

const MediaPreviewModal = ({ media, onClose }) => {
    if (!media) return null;

    const getMediaSource = () => {
        if (media.source === 'gdrive') {
            return `/api/v1/gdrive/stream/${media.id}`;
        }
        const path = media.filepath.startsWith('/') ? media.filepath : `/${media.filepath}`;
        return path;
    };

    const renderMediaContent = () => {
        const mediaSrc = getMediaSource();
        switch (media.type?.toLowerCase()) {
            case 'video':
                return <video src={mediaSrc} controls autoPlay playsInline />;
            case 'image':
                return <img src={mediaSrc} alt={media.display_name} />;
            case 'audio':
                return <audio src={mediaSrc} controls autoPlay />;
            default:
                return <p>Unsupported media type.</p>;
        }
    };

    return (
        <div className="media-preview-modal-overlay" onClick={onClose}>
            <div className="media-preview-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="close-button" onClick={onClose}>&times;</button>
                <div className="media-container">
                    {renderMediaContent()}
                </div>
                <div className="media-info">
                    <h3>{media.display_name}</h3>
                </div>
            </div>
        </div>
    );
};

export default MediaPreviewModal;