import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../../css/modules/_modal.css';
import MediaCard from '../MediaCard'; // Using MediaCard to display items

const MediaLibraryModal = ({ onSelect, onClose }) => {
    const [mediaItems, setMediaItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchMedia = async () => {
        setLoading(true);
        try {
            const response = await api.get('/media/'); // Fetch all media
            setMediaItems(response.data);
        } catch (error) {
            console.error("Failed to load media library", error);
            alert("Failed to load media library.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMedia();
    }, []);

    const handleUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        // Determine upload endpoint based on file type
        let uploadUrl = '/overlays/upload'; // Default to image
        if (file.type.startsWith('video/')) {
            uploadUrl = '/videos/upload';
        } else if (file.type.startsWith('audio/')) {
            uploadUrl = '/audios/upload';
        }

        try {
            await api.post(uploadUrl, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            fetchMedia(); // Refresh the library
        } catch (error) {
            console.error("Upload failed", error);
            alert("Upload failed.");
        }
    };

    const handleSelect = (item) => {
        let selectedUrl = '';
        if (item.type === 'Video') {
            selectedUrl = item.video_path;
        } else if (item.url) {
            selectedUrl = item.url;
        }
        
        if(selectedUrl){
            onSelect(selectedUrl);
        } else {
            alert("This media type cannot be selected.");
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Media Library</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="upload-section">
                        <input type="file" id="media-upload-input" accept="image/*,video/*,audio/*" onChange={handleUpload} />
                    </div>
                    <div className="results-grid">
                        {loading ? <p>Loading...</p> : mediaItems.map(item => (
                            <div key={item.id} onClick={() => handleSelect(item)}>
                                <MediaCard
                                    item={item}
                                    onDelete={() => {}} // No delete action in modal
                                    onRename={() => {}}   // No rename action in modal
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MediaLibraryModal;