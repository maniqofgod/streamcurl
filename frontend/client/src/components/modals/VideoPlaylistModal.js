import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../../css/modules/_modal.css';

const VideoPlaylistModal = ({ currentSources, onSave, onClose }) => {
    const [playlist, setPlaylist] = useState(currentSources);
    const [library, setLibrary] = useState([]);
    const [showLibrary, setShowLibrary] = useState(false);

    useEffect(() => {
        api.get('/videos/').then(response => {
            setLibrary(response.data);
        });
    }, []);

    const addVideoToPlaylist = (video) => {
        setPlaylist([...playlist, { ...video, id: `playlist-${Date.now()}` }]);
        setShowLibrary(false);
    };

    const removeVideoFromPlaylist = (id) => {
        setPlaylist(playlist.filter(video => video.id !== id));
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Manage Video Playlist</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="playlist-container">
                        {playlist.map((video, index) => (
                            <div key={video.id} className="playlist-item">
                                <span>{index + 1}. {video.display_name}</span>
                                <button onClick={() => removeVideoFromPlaylist(video.id)}>&times;</button>
                            </div>
                        ))}
                    </div>
                    {showLibrary && (
                        <div className="video-library-container">
                            <h3>Video Library</h3>
                            {library.map(video => (
                                <div key={video.id} className="library-item" onClick={() => addVideoToPlaylist(video)}>
                                    {video.display_name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="modal-btn" onClick={() => setShowLibrary(true)}>Add Video from Library</button>
                    <button className="modal-btn" onClick={() => onSave(playlist)}>Save Playlist</button>
                </div>
            </div>
        </div>
    );
};

export default VideoPlaylistModal;