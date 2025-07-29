import React from 'react';

const StreamDetails = ({ stream, setStream, onLinkYouTube }) => {
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