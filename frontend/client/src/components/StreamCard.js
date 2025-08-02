import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { goLiveStream, stopStream, getYouTubeStats, linkYoutube } from '../services/api';

const StreamCard = ({ stream, onStreamUpdate, onDelete, viewMode }) => {
    const { id, name, status, created_at, thumbnail_url, started_at, duration_seconds, youtube_video_id } = stream;
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [liveDuration, setLiveDuration] = useState('');
    const [isLinkingYoutube, setIsLinkingYoutube] = useState(false);
    const [youtubeIdToLink, setYoutubeIdToLink] = useState('');
    const [youtubeStats, setYoutubeStats] = useState({
        view_count: stream.youtube_view_count,
        like_count: stream.youtube_like_count,
        comment_count: stream.youtube_comment_count,
        live_viewers: stream.youtube_live_viewers
    });

    const formatDuration = (totalSeconds) => {
        if (isNaN(totalSeconds) || totalSeconds < 0) {
            return "00:00:00";
        }
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return [hours, minutes, seconds]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    };

    useEffect(() => {
        let interval;
        if (status === 'LIVE' && started_at) {
            interval = setInterval(() => {
                const startTime = new Date(started_at).getTime();
                const now = new Date().getTime();
                const duration = Math.floor((now - startTime) / 1000);
                setLiveDuration(formatDuration(duration));
            }, 1000);
        } else {
            setLiveDuration('');
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [status, started_at]);

    

    useEffect(() => {
        let statsInterval;
        if (status === 'LIVE' && youtube_video_id) {
            const fetchStats = async () => {
                try {
                    const updatedStats = await getYouTubeStats(id);
                    setYoutubeStats(updatedStats);
                } catch (error) {
                    console.error("Failed to fetch YouTube stats:", error);
                }
            };

            fetchStats();
            statsInterval = setInterval(fetchStats, 15000);
        }

        return () => {
            if (statsInterval) {
                clearInterval(statsInterval);
            }
        };
    }, [status, id, youtube_video_id]);

    const handleAction = async (action) => {
        setIsLoading(true);
        try {
            let response;
            switch (action) {
                case 'go-live':
                    response = await goLiveStream(id, { live_platform: 'youtube' });
                    break;
                case 'stop':
                    response = await stopStream(id);
                    break;
                default:
                    throw new Error("Invalid action");
            }
            if (onStreamUpdate && response) {
                onStreamUpdate(response);
            }
        } catch (error) {
            console.error(`Error during ${action}:`, error);
            alert(`Failed to ${action} stream. Please check the console for details.`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = () => {
        onDelete(id);
    };

    const handleEdit = () => {
        navigate(`/editor/${id}`);
    };

    const handleLinkYouTube = async () => {
        if (!youtubeIdToLink) {
            alert("Please enter a YouTube Video ID.");
            return;
        }
        setIsLoading(true);
        try {
            const updatedStream = await linkYoutube(id, { youtube_video_id: youtubeIdToLink });
            if (onStreamUpdate) {
                onStreamUpdate(updatedStream);
            }
            setIsLinkingYoutube(false);
            setYoutubeIdToLink('');
        } catch (error) {
            console.error("Failed to link YouTube video:", error);
            alert("Failed to link YouTube video. Please check the console for details.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenYouTube = () => {
        if (stream.youtube_video_id) {
            window.open(`https://www.youtube.com/live/${stream.youtube_video_id}`, '_blank');
        }
    };

    const renderButtons = (isListMode = false) => {
        const buttonClass = isListMode ? "control-btn-sm" : "action-btn-secondary";
        const buttonMap = {
            'go-live': <button key="go-live" onClick={() => handleAction('go-live')} disabled={isLoading} className={`${buttonClass} action-btn-start`}>Go Live</button>,
            stop: <button key="stop" onClick={() => handleAction('stop')} disabled={isLoading} className={`${buttonClass} action-btn-stop`}>Stop</button>,
            processing: <button key="processing" disabled className={buttonClass}>Processing...</button>,
            edit: <button key="edit" onClick={handleEdit} disabled={isLoading} className={`${buttonClass} action-btn-edit`}>Edit</button>,
            delete: <button key="delete" onClick={handleDelete} disabled={isLoading} className={`${buttonClass} action-btn-danger`}>Delete</button>,
            link_youtube: <button key="link_youtube" onClick={() => setIsLinkingYoutube(true)} disabled={isLoading} className={buttonClass}>Link Video ID</button>,
            open_youtube: <button key="open_youtube" onClick={handleOpenYouTube} disabled={isLoading} className={buttonClass}>Open</button>
        };

        let actions = [];
        switch (status) {
            case 'Idle':
            case 'CREATED':
            case 'FINISHED':
            case 'Error':
            case 'STOPPED':
                actions = ['go-live', 'edit', 'delete'];
                break;
            case 'Previewing':
                actions = ['go-live', 'stop', 'edit', 'delete'];
                break;
            case 'LIVE':
            case 'Running':
                actions = ['stop'];
                if (stream.youtube_video_id) {
                    actions.push('open_youtube');
                } else {
                    actions.push('link_youtube');
                }
                break;
            case 'Processing':
            case 'STARTING':
            case 'STOPPING':
            case 'Downloading':
                actions = ['processing'];
                break;
            default:
                return <button disabled className={buttonClass}>{status || 'Unknown'}</button>;
        }
        return actions.map(key => buttonMap[key]);
    };

    const getThumbnailUrl = () => {
        if (!thumbnail_url) return null;
        
        const API_BASE_URL = process.env.REACT_APP_API_URL || '';
        const token = localStorage.getItem('access_token');
        let url = thumbnail_url;

        if (!url.startsWith('http')) {
            url = `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
        }
    
        if (url.includes('/gdrive/')) {
            return `${url}?token=${token}`;
        }
        
        return url;
    };

    const finalThumbnailUrl = getThumbnailUrl();
    const hasStats = typeof youtubeStats.view_count === 'number';
    
    if (viewMode === 'list') {
        const displayDuration = status === 'LIVE' ? liveDuration : (duration_seconds ? formatDuration(duration_seconds) : null);
        return (
            <div className="stream-list-item">
                <div className="list-item-thumbnail">
                    {finalThumbnailUrl ? <img src={finalThumbnailUrl} alt={name} /> : <i className="fas fa-video no-preview-icon"></i>}
                </div>
                <div className="list-item-info">
                    <h3 className="stream-name">{name}</h3>
                    <p className="stream-date">Created: {created_at ? new Date(created_at).toLocaleString() : 'N/A'}</p>
                    {hasStats && (
                        <div className="youtube-stats-list">
                            <span><i className="fas fa-eye"></i> {(youtubeStats.view_count ?? 0).toLocaleString()}</span>
                            <span><i className="fas fa-thumbs-up"></i> {(youtubeStats.like_count ?? 0).toLocaleString()}</span>
                            
                        </div>
                    )}
                </div>
                <div className="list-item-status">
                    <span className={`status-badge ${status ? status.toLowerCase() : ''}`}>{status}</span>
                    {status === 'Downloading' && typeof stream.download_progress === 'number' && (
                        <div className="download-progress-bar-container">
                            <div 
                                className="download-progress-bar" 
                                style={{ width: `${stream.download_progress}%` }}
                            >
                                {stream.download_progress.toFixed(0)}%
                            </div>
                        </div>
                    )}
                    {displayDuration && <span className="stream-duration">{displayDuration}</span>}
                </div>
                <div className="list-item-actions">
                    {renderButtons(true)}
                </div>
            </div>
        );
    }

    return (
        <div className="item-card">
            <div className="card-thumbnail">
                {youtube_video_id ? (
                    <div className="youtube-player-container">
                        <iframe
                            src={`https://www.youtube.com/embed/${youtube_video_id}?autoplay=1&mute=1`}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={name}
                        ></iframe>
                    </div>
                ) : (
                    finalThumbnailUrl ? <img src={finalThumbnailUrl} alt={name} /> : <i className="fas fa-video no-preview-icon"></i>
                )}
                <div className="thumbnail-header">
                    <span className={`status-badge ${status ? status.toLowerCase() : ''}`}>{status}</span>
                </div>
                <div className="thumbnail-footer">
                    {status === 'LIVE' && <span className="stream-duration stream-duration-live">{liveDuration}</span>}
                    <span className="thumbnail-title">{name}</span>
                </div>
            </div>
            <div className="card-content">
                <p className="card-meta">Created: {created_at ? new Date(created_at).toLocaleString() : 'N/A'}</p>
                {isLinkingYoutube && (
                    <div className="youtube-link-live">
                        <input 
                            type="text" 
                            value={youtubeIdToLink} 
                            onChange={(e) => setYoutubeIdToLink(e.target.value)}
                            placeholder="Enter YouTube Video ID"
                            className="youtube-link-input"
                        />
                        <button onClick={handleLinkYouTube} disabled={isLoading} className="action-btn-secondary">Save</button>
                        <button onClick={() => setIsLinkingYoutube(false)} disabled={isLoading} className="action-btn-secondary">Cancel</button>
                    </div>
                )}
                {status === 'Downloading' && typeof stream.download_progress === 'number' && (
                    <div className="download-progress-bar-container">
                        <div 
                            className="download-progress-bar" 
                            style={{ width: `${stream.download_progress}%` }}
                        >
                            {stream.download_progress.toFixed(0)}%
                        </div>
                    </div>
                )}
                {hasStats && (
                    <div className="youtube-stats">
                        <span title="Views"><i className="fas fa-eye"></i> {(youtubeStats.view_count ?? 0).toLocaleString()}</span>
                        <span title="Likes"><i className="fas fa-thumbs-up"></i> {(youtubeStats.like_count ?? 0).toLocaleString()}</span>
                        
                    </div>
                )}
            </div>
            <div className="card-actions">
                {renderButtons()}
            </div>
        </div>
    );
};

export default StreamCard;