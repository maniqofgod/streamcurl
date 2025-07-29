import React from 'react';

const AdvancedSettings = ({ settings, setSettings, canvasAspectRatio, vpsList, selectedVpsId, onVpsChange, userRole }) => {
    const handleSettingsChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleVpsChange = (e) => {
        const { value } = e.target;
        onVpsChange(value ? parseInt(value, 10) : null);
    };

    return (
        <div className="advanced-settings-panel">
            <h3>Advanced Settings</h3>
            <div className="form-group">
                <label htmlFor="vps-select">Worker Node (VPS)</label>
                <select id="vps-select" value={selectedVpsId || ''} onChange={handleVpsChange}>
                    {userRole === 'admin' && <option value="">Local Worker</option>}
                    {vpsList && vpsList.map(vps => (
                        <option key={vps.id} value={vps.id}>
                            {vps.name} ({vps.ip_address})
                        </option>
                    ))}
                    {vpsList && vpsList.length === 0 && userRole !== 'admin' && <option value="" disabled>No VPS available</option>}
                </select>
            </div>
            <div className="form-group">
                <label htmlFor="resolution">Resolution</label>
                <select id="resolution" name="resolution" value={settings.resolution} onChange={handleSettingsChange}>
                    {canvasAspectRatio === '16:9' ? (
                        <>
                            <option value="1920x1080">1920x1080</option>
                            <option value="1280x720">1280x720</option>
                        </>
                    ) : (
                        <>
                            <option value="1080x1920">1080x1920</option>
                            <option value="720x1280">720x1280</option>
                        </>
                    )}
                </select>
            </div>
            <div className="form-group">
                <label htmlFor="transcode-mode">Transcode mode</label>
                <select id="transcode-mode" name="transcode_mode" value={settings.transcode_mode} onChange={handleSettingsChange}>
                    <option value="vbr">VBR</option>
                    <option value="cbr">CBR</option>
                    <option value="abr">ABR</option>
                </select>
            </div>
            <div className="form-group">
                <label htmlFor="video-bitrate">Video Bitrate</label>
                <select id="video-bitrate" name="video_bitrate" value={settings.video_bitrate} onChange={handleSettingsChange}>
                    <option value="7000">7000 kb/s</option>
                    <option value="5000">5000 kb/s</option>
                    <option value="3000">3000 kb/s</option>
                    <option value="2500">2500 kb/s</option>
                </select>
            </div>
            <div className="form-group">
                <label htmlFor="video-fps">Video FPS</label>
                <select id="video-fps" name="video_fps" value={settings.video_fps} onChange={handleSettingsChange}>
                    <option value="30">30 fps</option>
                    <option value="60">60 fps</option>
                </select>
            </div>
            <div className="form-group">
                <label htmlFor="audio-bitrate">Audio Bitrate</label>
                <select id="audio-bitrate" name="audio_bitrate" value={settings.audio_bitrate} onChange={handleSettingsChange}>
                    <option value="320">320k</option>
                    <option value="256">256k</option>
                    <option value="192">192k</option>
                    <option value="160">160k</option>
                    <option value="128">128k</option>
                </select>
            </div>
        </div>
    );
};

export default AdvancedSettings;