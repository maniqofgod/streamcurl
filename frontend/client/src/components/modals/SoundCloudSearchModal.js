import React, { useState } from 'react';
import { searchSoundcloud, downloadSoundcloudTrack } from '../../services/api';
import LoadingSpinner from '../LoadingSpinner'; // Import the spinner
import '../../css/modules/_modal.css';

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


const SoundCloudSearchModal = ({ onSelect, onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState({});
    const [page, setPage] = useState(1);
    const [canLoadMore, setCanLoadMore] = useState(true);

    const handleSearch = async (isNewSearch = true) => {
        if (!query) return;
        
        const currentPage = isNewSearch ? 1 : page;
        if (isNewSearch) {
            setResults([]);
            setCanLoadMore(true);
        }

        setLoading(true);
        try {
            const data = await searchSoundcloud(query, 10, currentPage);
            if (data.length === 0) {
                setCanLoadMore(false);
            }
            setResults(prev => isNewSearch ? data : [...prev, ...data]);
            if (!isNewSearch) {
                setPage(currentPage + 1);
            } else {
                setPage(2);
            }
        } catch (error) {
            console.error("SoundCloud search failed", error);
            alert("Failed to search SoundCloud.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectTrack = async (track) => {
        if (downloading[track.id]) return;

        setDownloading(prev => ({ ...prev, [track.id]: true }));
        try {
            const downloadedAudio = await downloadSoundcloudTrack({
                url: track.webpage_url,
                track_id: track.id,
                title: track.title
            });
            onSelect(downloadedAudio);
            onClose();
        } catch (error) {
            console.error("SoundCloud download failed", error);
            alert(`Failed to download track: ${error.response?.data?.detail || error.message}`);
        } finally {
            setDownloading(prev => ({ ...prev, [track.id]: false }));
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Search SoundCloud</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="search-bar">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSearch(true)}
                            placeholder="Search for tracks..."
                        />
                        <button onClick={() => handleSearch(true)} disabled={loading}>
                            {loading && page === 1 ? <LoadingSpinner size="small" /> : 'Search'}
                        </button>
                    </div>
                    <div className="results-list">
                        {results.map(track => (
                            <div 
                                key={track.id} 
                                className={`soundcloud-track ${downloading[track.id] ? 'downloading' : ''}`} 
                                onClick={() => handleSelectTrack(track)}
                            >
                                <ImageWithFallback 
                                    src={track.artwork_url ? track.artwork_url.replace('-large.jpg', '-t50x50.jpg') : ''} 
                                    alt={track.title} 
                                    className="track-artwork" 
                                />
                                <div className="track-info">
                                    <p className="track-title">{track.title}</p>
                                    <div className="track-meta">
                                        <span>{formatDuration(track.duration)}</span>
                                        <span>{formatBytes(track.filesize_approx)}</span>
                                    </div>
                                </div>
                                {downloading[track.id] && <div className="download-indicator"><LoadingSpinner size="small" /></div>}
                            </div>
                        ))}
                    </div>
                    {canLoadMore && results.length > 0 && (
                        <button className="load-more-btn" onClick={() => handleSearch(false)} disabled={loading}>
                            {loading && page > 1 ? <LoadingSpinner size="small" /> : 'Load More'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SoundCloudSearchModal;