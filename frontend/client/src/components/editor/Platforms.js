import React, { useState } from 'react';
import { linkYoutube } from '../../services/api';

const Platforms = ({ platforms, setPlatforms, streamId, onStreamUpdate }) => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [isLinking, setIsLinking] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPlatforms(prev => ({ ...prev, [name]: value }));
    };

    const handleLinkYouTube = async () => {
        if (!youtubeUrl) {
            alert('Please enter a YouTube URL.');
            return;
        }
        setIsLinking(true);
        try {
            const updatedStream = await linkYoutube(streamId, { youtube_url: youtubeUrl });
            if (onStreamUpdate) {
                onStreamUpdate(updatedStream);
            }
            alert('Successfully linked YouTube video and fetched stats.');
            setYoutubeUrl(''); // Clear input after success
        } catch (error) {
            console.error('Failed to link YouTube video:', error);
            alert(`Failed to link YouTube video. ${error.response?.data?.detail || 'Please check the console for details.'}`);
        } finally {
            setIsLinking(false);
        }
    };

    return (
        <div className="platform-panel-v4">
            <h3>Platforms</h3>
            <div className="form-group">
                <label>YouTube Live Stream Key</label>
                <input 
                    type="text" 
                    name="youtube_stream_key"
                    placeholder="Stream Key (rtmp://a.rtmp.youtube.com/live2)" 
                    value={platforms.youtube_stream_key || ''}
                    onChange={handleChange}
                />
            </div>
            <div className="form-group">
                <label>Link Existing YouTube Video</label>
                <div className="youtube-link-container">
                    <input 
                        type="text" 
                        placeholder="YouTube Video URL" 
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        disabled={isLinking}
                    />
                    <button onClick={handleLinkYouTube} disabled={isLinking} className="control-btn-sm">
                        {isLinking ? 'Linking...' : 'Link'}
                    </button>
                </div>
                <p className="form-hint">Link a pre-existing YouTube video to display its stats on the stream card.</p>
            </div>
        </div>
    );
};

export default Platforms;