import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';

const StreamDetails = ({ stream, setStream, onLinkYouTube }) => {
    const [vpsList, setVpsList] = useState([]);

    useEffect(() => {
        const fetchVpsList = async () => {
            try {
                const data = await api.readVpsList();
                if (Array.isArray(data)) {
                    setVpsList(data);
                } else {
                    console.error("API response for VPS list is not an array:", data);
                    setVpsList([]); // Default to an empty array
                }
            } catch (error) {
                console.error("Failed to fetch VPS list", error);
                setVpsList([]); // Also set to empty on error
            }
        };
        fetchVpsList();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setStream(prevStream => ({
            ...prevStream,
            [name]: value
        }));
    };

    return (
        <div className="form-container-v4">
            <h3>Stream Details</h3>
            <div className="form-group">
                <label htmlFor="stream-name">Stream Name</label>
                <input 
                    type="text" 
                    id="stream-name" 
                    name="name" 
                    value={stream.name || ''} 
                    onChange={handleChange} 
                />
            </div>
            <div className="form-group">
                <label htmlFor="youtube-video-id">YouTube Video ID</label>
                <input
                    type="text"
                    id="youtube-video-id"
                    name="youtube_video_id"
                    value={stream.youtube_video_id || ''}
                    onChange={handleChange}
                    placeholder="e.g., DSuxS12g-nw"
                />
            </div>
            <button onClick={onLinkYouTube} className="editor-action-btn">
                Link YouTube & Fetch Stats
            </button>
        </div>
    );
};

export default StreamDetails;