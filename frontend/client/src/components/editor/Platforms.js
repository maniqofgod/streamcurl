import React from 'react';

const Platforms = ({ platforms, setPlatforms }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        setPlatforms(prev => ({ ...prev, [name]: value }));
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
        </div>
    );
};

export default Platforms;