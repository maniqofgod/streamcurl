import React, { useState, useEffect } from 'react';
import { getGoogleDriveFiles, searchSoundcloud, downloadSoundcloudTrack } from '../../services/api';
import '../../css/modules/_modal.css';
import LoadingSpinner from '../LoadingSpinner';
import UploadMediaModal from './UploadMediaModal';

// Helper component to handle broken images
const ImageWithFallback = ({ src, alt, ...props }) => {
    const [error, setError] = useState(false);
    const handleError = () => setError(true);
    
    if (error || !src) {
        return null; // Don't render anything if the image fails or src is missing
    }
    
    return <img src={src} alt={alt} onError={handleError} {...props} />;
};

// Helper to format duration from seconds to MM:SS
const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

// Helper to format bytes into KB, MB, etc.
const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const AudioLibraryModal = ({ isOpen, onClose, onSave }) => {
    const [audios, setAudios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAudios, setSelectedAudios] = useState([]);
    const [isUploadModalOpen, setUploadModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('library');

    // SoundCloud state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [downloading, setDownloading] = useState({}); // Changed to object
    const [page, setPage] = useState(1);
    const [canLoadMore, setCanLoadMore] = useState(true);

    const fetchAudios = async () => {
        setLoading(true);
        try {
            const data = await getGoogleDriveFiles('audio');
            const audioFiles = data.map(item => ({
                ...item,
                id: item.gdrive_id, // Remap gdrive_id to id for consistency
                
            }));
            setAudios(audioFiles);
        } catch (error) {
            console.error("Failed to load audio library from Google Drive", error);
            alert("Failed to load audio library from Google Drive.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && activeTab === 'library') {
            fetchAudios();
        }
    }, [isOpen, activeTab]);

    const handleSearch = async (isNewSearch = true) => {
        if (!searchQuery) return;
        
        const currentPage = isNewSearch ? 1 : page;
        if (isNewSearch) {
            setSearchResults([]);
            setCanLoadMore(true);
        }

        setSearching(true);
        try {
            const data = await searchSoundcloud(searchQuery, 10, currentPage);
            if (data.length === 0) {
                setCanLoadMore(false);
            }
            setSearchResults(prev => isNewSearch ? data : [...prev, ...data]);
            setPage(currentPage + 1);
        } catch (error) {
            console.error("SoundCloud search failed", error);
            alert("Failed to search SoundCloud.");
        } finally {
            setSearching(false);
        }
    };

    const handleDownloadTrack = async (track) => {
        if (downloading[track.id]) return;

        setDownloading(prev => ({ ...prev, [track.id]: true }));
        try {
            // Correctly pass the track object
            await downloadSoundcloudTrack({
                url: track.webpage_url,
                track_id: track.id,
                title: track.title
            });
            alert(`'${track.title}' downloaded successfully! It's now in your library.`);
            // Optionally switch to library and refresh
            setActiveTab('library');
            fetchAudios();
        } catch (error) {
            console.error("SoundCloud download failed", error);
            alert(`Failed to download '${track.title}'. Error: ${error.response?.data?.detail || error.message}`);
        } finally {
            setDownloading(prev => ({ ...prev, [track.id]: false }));
        }
    };

    const toggleSelection = (audio) => {
        setSelectedAudios(prev =>
            prev.find(a => a.id === audio.id)
                ? prev.filter(a => a.id !== audio.id)
                : [...prev, audio]
        );
    };

    const handleSave = () => {
        onSave(selectedAudios);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop">
            <div className="modal-content large">
                <div className="modal-header">
                    <h2>Audio Library</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="modal-tabs">
                        <button className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>My Library</button>
                        <button className={`tab-btn ${activeTab === 'soundcloud' ? 'active' : ''}`} onClick={() => setActiveTab('soundcloud')}>SoundCloud</button>
                        <button className="modal-btn" onClick={() => setUploadModalOpen(true)}>Upload Audio</button>
                    </div>
                    {activeTab === 'library' && (
                        <>
                            <div className="media-library-grid">
                                {loading ? (
                                    <LoadingSpinner size="medium" />
                                ) : (
                                    audios.map(audio => (
                                        <div
                                            key={audio.id}
                                            className={`media-item audio-card ${selectedAudios.some(a => a.id === audio.id) ? 'selected' : ''}`}
                                            onClick={() => toggleSelection(audio)}
                                        >
                                            <div className="audio-icon"><i className="fas fa-music"></i></div>
                                            <p className="media-name">{audio.display_name}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                    {activeTab === 'soundcloud' && (
                        <>
                            <div className="search-bar">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for tracks on SoundCloud..."
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch(true)}
                                />
                                <button onClick={() => handleSearch(true)} disabled={searching}>
                                    {searching && page === 1 ? <LoadingSpinner size="small" /> : 'Search'}
                                </button>
                            </div>
                            <div className="results-list soundcloud-results">
                                {searchResults.map(track => (
                                    <div key={track.id} className="soundcloud-track">
                                        <ImageWithFallback 
                                            src={track.artwork_url ? track.artwork_url.replace('-large.jpg', '-t50x50.jpg') : ''} 
                                            alt={track.title} 
                                            className="track-artwork" 
                                        />
                                        <div className="track-info">
                                            <p className="track-title">{track.title}</p>
                                            <p className="track-uploader">{track.uploader}</p>
                                            <div className="track-meta">
                                                <span>{formatDuration(track.duration)}</span>
                                                <span>{formatBytes(track.filesize_approx)}</span>
                                            </div>
                                        </div>
                                        <button 
                                            className="download-btn" 
                                            onClick={() => handleDownloadTrack(track)}
                                            disabled={downloading[track.id]}
                                        >
                                            {downloading[track.id] ? <LoadingSpinner size="small" /> : <i className="fas fa-download"></i>}
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {canLoadMore && searchResults.length > 0 && (
                                <button className="load-more-btn" onClick={() => handleSearch(false)} disabled={searching}>
                                    {searching && page > 1 ? <LoadingSpinner size="small" /> : 'Load More'}
                                </button>
                            )}
                        </>
                    )}
                </div>
                <div className="modal-footer">
                    {activeTab === 'library' && (
                        <button onClick={handleSave} className="modal-btn save-btn" disabled={selectedAudios.length === 0}>
                            Add Selected to Source
                        </button>
                    )}
                </div>
                {isUploadModalOpen && (
                    <UploadMediaModal 
                        onClose={() => setUploadModalOpen(false)}
                        onUploadComplete={() => {
                            setUploadModalOpen(false);
                            fetchAudios(); // Refresh library
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default AudioLibraryModal;