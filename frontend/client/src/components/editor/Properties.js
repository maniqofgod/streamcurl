import React, { useState, useEffect } from 'react';
import FontSelector from '../FontSelector';
import VideoEffects from './VideoEffects';

const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const ChromaKeySettings = ({ settings, onUpdate }) => {
    const safeSettings = {
        enabled: false,
        color: '#00ff00',
        similarity: 0.1,
        smoothness: 0.05,
        spill: 0.05,
        ...(settings || {})
    };

    const handleChange = (key, value) => {
        onUpdate({ [key]: value });
    };

    return (
        <div className="chroma-key-settings">
            <div className="property-group">
                <label>
                    <input
                        type="checkbox"
                        checked={safeSettings.enabled}
                        onChange={(e) => handleChange('enabled', e.target.checked)}
                    />
                    Enable Chroma Key
                </label>
            </div>
            {safeSettings.enabled && (
                <>
                    <div className="property-group">
                        <label htmlFor="chroma-color">Key Color</label>
                        <input
                            type="color"
                            id="chroma-color"
                            value={safeSettings.color}
                            onChange={(e) => handleChange('color', e.target.value)}
                        />
                    </div>
                    <div className="property-group">
                        <label htmlFor="chroma-similarity">Similarity</label>
                        <input
                            type="range"
                            id="chroma-similarity"
                            min="0"
                            max="1"
                            step="0.01"
                            value={safeSettings.similarity}
                            onChange={(e) => handleChange('similarity', parseFloat(e.target.value))}
                        />
                        <span>{safeSettings.similarity}</span>
                    </div>
                    <div className="property-group">
                        <label htmlFor="chroma-smoothness">Smoothness</label>
                        <input
                            type="range"
                            id="chroma-smoothness"
                            min="0"
                            max="1"
                            step="0.01"
                            value={safeSettings.smoothness}
                            onChange={(e) => handleChange('smoothness', parseFloat(e.target.value))}
                        />
                        <span>{safeSettings.smoothness}</span>
                    </div>
                    <div className="property-group">
                        <label htmlFor="chroma-spill">Spill</label>
                        <input
                            type="range"
                            id="chroma-spill"
                            min="0"
                            max="1"
                            step="0.01"
                            value={safeSettings.spill}
                            onChange={(e) => handleChange('spill', parseFloat(e.target.value))}
                        />
                        <span>{safeSettings.spill}</span>
                    </div>
                </>
            )}
        </div>
    );
};

const ImageSourceProperties = ({ source, onOpenImageLibrary, onDeleteImageFromSource, onUpdateImageProperties }) => {
    const items = source.items || [];
    const [expandedItemId, setExpandedItemId] = useState(null);

    const toggleExpand = (itemId) => {
        setExpandedItemId(expandedItemId === itemId ? null : itemId);
    };

    return (
        <div className="image-source-properties">
            <div className="playlist-section">
                <button onClick={onOpenImageLibrary} className="modal-btn add-playlist-btn">
                    <i className="fas fa-plus"></i> Add Images
                </button>
                <div className="playlist-items">
                    {items.map((image) => (
                        <div key={image.id} className="playlist-item-wrapper">
                            <div className="playlist-item">
                                <span className="video-name">{image.display_name}</span>
                                <small className="video-filepath">{image.filepath ? image.filepath.split('/').pop() : ''}</small>
                                <div className="playlist-item-controls">
                                    <button title="Settings" onClick={() => toggleExpand(image.id)} className="control-btn-sm">
                                        <i className="fas fa-cog"></i>
                                    </button>
                                    <button
                                        title="Remove"
                                        onClick={() => onDeleteImageFromSource(source.id, image.id)}
                                        className="control-btn-sm delete-btn"
                                    >
                                        &times;
                                    </button>
                                </div>
                            </div>
                            {expandedItemId === image.id && image.chromaKey && (
                                <div className="item-settings">
                                    <h4>Chroma Key</h4>
                                    <ChromaKeySettings 
                                        settings={image.chromaKey}
                                        onUpdate={(newChromaSettings) => onUpdateImageProperties(source.id, image.id, { chromaKey: newChromaSettings })}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const AudioSourceProperties = ({ 
    source, 
    onOpenAudioLibrary, 
    onDeleteAudioFromSource,
    isPlaying,
    volume,
    onPlayPause,
    onVolumeChange,
    onUpdateAudioProperties,
    currentAudioTime,
    currentAudioIndex,
    onSeekAudio,
    muteOriginalVideo,
    onMuteOriginalVideoChange
}) => {
    const items = source.items || [];
    const totalDuration = items.reduce((acc, audio) => acc + (audio.duration || 0), 0);
    const currentAudio = items && typeof currentAudioIndex === 'number' && currentAudioIndex >= 0 ? items[currentAudioIndex] : null;

    return (
        <div className="audio-source-properties">
            <div className="property-group">
                <label>
                    <input
                        type="checkbox"
                        checked={muteOriginalVideo}
                        onChange={(e) => onMuteOriginalVideoChange(e.target.checked)}
                    />
                    Mute original video audio
                </label>
            </div>
            <div className="playlist-section">
                <button onClick={onOpenAudioLibrary} className="modal-btn add-playlist-btn">
                    <i className="fas fa-plus"></i> Add Audio
                </button>
                <div className="playlist-items">
                    {items.map((audio, index) => (
                        <div key={audio.id} className={`playlist-item ${index === currentAudioIndex ? 'active' : ''}`}>
                            <div className="audio-details">
                                <span className="audio-name">{audio.display_name}</span>
                                <small className="audio-filepath">{audio.filepath ? audio.filepath.split('/').pop() : ''}</small>
                            </div>
                            <div className="playlist-item-controls">
                                <span className="audio-duration">{formatDuration(audio.duration)}</span>
                                <div className="loop-control">
                                   <input 
                                        type="checkbox" 
                                        id={`loop-audio-${audio.id}`} 
                                        checked={audio.loop || false} 
                                        onChange={(e) => onUpdateAudioProperties(source.id, audio.id, { loop: e.target.checked })}
                                    />
                                    <label htmlFor={`loop-audio-${audio.id}`}>Loop</label>
                                </div>
                                <button
                                    title="Remove"
                                    onClick={() => onDeleteAudioFromSource(source.id, audio.id)}
                                    className="control-btn-sm delete-btn"
                                >
                                    &times;
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="controls-section">
                {currentAudio && (
                     <input 
                        type="range"
                        min="0"
                        max={currentAudio.duration || 0}
                        value={currentAudioTime}
                        onChange={(e) => onSeekAudio(parseFloat(e.target.value))}
                        className="playback-slider"
                    />
                )}
                <div className="playlist-controls">
                    <button onClick={onPlayPause} disabled={items.length === 0}>
                        <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                    </button>
                    <div className="volume-control">
                        <i className={`fas ${volume > 0 ? 'fa-volume-up' : 'fa-volume-mute'}`}></i>
                        <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.01" 
                            value={volume} 
                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                            className="volume-slider"
                        />
                    </div>
                    {currentAudio && (
                         <span className="time-display">
                            {formatDuration(currentAudioTime)} / {formatDuration(currentAudio.duration)}
                         </span>
                    )}
                    <span className="total-duration">Total: {formatDuration(totalDuration)}</span>
                </div>
            </div>
        </div>
    );
};

const TextSourceProperties = ({ source, onUpdateSourceProperties }) => {
    const [googleFonts, setGoogleFonts] = useState([]);
    const apiKey = 'AIzaSyBRYEEqqKZktCgnKkt1X_KcRpU9azDeI64';

    useEffect(() => {
        fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}`)
            .then(res => res.json())
            .then(data => {
                if (data.items) {
                    setGoogleFonts(data.items.map(font => font.family));
                }
            })
            .catch(error => console.error("Failed to fetch Google Fonts:", error));
    }, [apiKey]);

    const allFonts = ["Arial", "Verdana", "Times New Roman", "Courier New", "Georgia", "Impact", ...googleFonts];

    return (
        <div className="text-source-properties">
            <div className="property-group">
                <label htmlFor="text-content">Text</label>
                <textarea
                    id="text-content"
                    value={source.text || ''}
                    onChange={(e) => onUpdateSourceProperties(source.id, { text: e.target.value })}
                />
            </div>
            <div className="property-group">
                <label htmlFor="text-font">Font</label>
                <FontSelector
                    selectedFont={source.font}
                    fonts={allFonts}
                    onChange={(font) => onUpdateSourceProperties(source.id, { font: font })}
                />
            </div>
            <div className="property-group">
                <label htmlFor="text-size">Size</label>
                <input
                    type="number"
                    id="text-size"
                    value={source.size}
                    onChange={(e) => onUpdateSourceProperties(source.id, { size: parseInt(e.target.value, 10) })}
                />
            </div>
            <div className="property-group">
                <label htmlFor="text-color">Color</label>
                <input
                    type="color"
                    id="text-color"
                    value={source.color}
                    onChange={(e) => onUpdateSourceProperties(source.id, { color: e.target.value })}
                />
            </div>
            <div className="property-group">
                <label htmlFor="text-effect">Effect</label>
                <select
                    id="text-effect"
                    value={source.effect || 'none'}
                    onChange={(e) => onUpdateSourceProperties(source.id, { effect: e.target.value })}
                >
                    <option value="none">None</option>
                    <option value="scroll_left">Scroll Left</option>
                    <option value="scroll_right">Scroll Right</option>
                    <option value="scroll_up">Scroll Up</option>
                    <option value="scroll_down">Scroll Down</option>
                    <option value="glow">Glow</option>
                    <option value="shadow">Shadow</option>
                    <option value="typing">Typing</option>
                    <option value="fade_in">Fade In</option>
                </select>
            </div>
        </div>
    );
};

const BrowserSourceProperties = ({ source, onUpdateSourceProperties }) => {
    return (
        <div className="browser-source-properties">
            <div className="property-group">
                <label htmlFor="browser-url">URL</label>
                <input
                    type="text"
                    id="browser-url"
                    value={source.url}
                    onChange={(e) => onUpdateSourceProperties(source.id, { url: e.target.value })}
                />
            </div>
            <div className="property-group">
                <label htmlFor="browser-width">Width</label>
                <input
                    type="number"
                    id="browser-width"
                    value={source.width}
                    onChange={(e) => onUpdateSourceProperties(source.id, { width: parseInt(e.target.value, 10) })}
                />
            </div>
            <div className="property-group">
                <label htmlFor="browser-height">Height</label>
                <input
                    type="number"
                    id="browser-height"
                    value={source.height}
                    onChange={(e) => onUpdateSourceProperties(source.id, { height: parseInt(e.target.value, 10) })}
                />
            </div>
        </div>
    );
};


const VideoPlaylistProperties = ({ 
    source, 
    onOpenVideoLibrary, 
    isPlaying, 
    volume, 
    onPlayPause, 
    onVolumeChange,
    onModeChange,
    playlistCurrentTime,
    playlistCurrentIndex,
    onDeleteVideoFromPlaylist,
    onUpdateVideoProperties,
    onSeek
}) => {
    
    const playlist = source.playlist || [];
    const totalDuration = playlist.reduce((acc, video) => acc + (video.duration || 0), 0);
    const isPlaylistMode = source.playbackMode === 'playlist';
    const currentVideo = isPlaylistMode && playlist[playlistCurrentIndex] ? playlist[playlistCurrentIndex] : null;

    const [expandedItemId, setExpandedItemId] = useState(null);
    const [effectsExpanded, setEffectsExpanded] = useState(null);

    const toggleExpand = (itemId) => {
        setExpandedItemId(expandedItemId === itemId ? null : itemId);
    };

    return (
        <div className="video-playlist-properties">
            <div className="playback-mode-selector">
                <button 
                    className={!isPlaylistMode ? 'active' : ''} 
                    onClick={() => onModeChange(source.id, 'individual')}
                >
                    Video Terpisah
                </button>
                <button 
                    className={isPlaylistMode ? 'active' : ''} 
                    onClick={() => onModeChange(source.id, 'playlist')}
                >
                    Gabungkan Video
                </button>
            </div>

            <div className="playlist-section">
                <button onClick={onOpenVideoLibrary} className="modal-btn add-playlist-btn">
                    <i className="fas fa-plus"></i> Add to Playlist
                </button>
                <div className="playlist-items">
                        {playlist.map((video, index) => (
                        <div key={video.id} className="playlist-item-wrapper">
                            <div className={`playlist-item ${isPlaylistMode && index === playlistCurrentIndex ? 'active' : ''}`}>
                                <span className="video-name">{video.display_name}</span>
                                <div className="playlist-item-controls">
                                    <span className="video-duration">{formatDuration(video.duration)}</span>
                                    <button 
                                        title={video.muted ? "Unmute" : "Mute"}
                                        onClick={() => onUpdateVideoProperties(source.id, video.id, { muted: !video.muted })}
                                        className="control-btn-sm"
                                    >
                                        <i className={`fas ${video.muted ? 'fa-volume-mute' : 'fa-volume-up'}`}></i>
                                    </button>
                                    <div className="loop-control">
                                       <input 
                                            type="checkbox" 
                                            id={`loop-${video.id}`} 
                                            checked={video.loop || false} 
                                            onChange={(e) => onUpdateVideoProperties(source.id, video.id, { loop: e.target.checked })}
                                        />
                                        <label htmlFor={`loop-${video.id}`}>Loop</label>
                                    </div>
                                    <button title="Settings" onClick={() => toggleExpand(video.id)} className="control-btn-sm">
                                        <i className="fas fa-cog"></i>
                                    </button>
                                    <button title="Effects" onClick={() => setEffectsExpanded(effectsExpanded === video.id ? null : video.id)} className="control-btn-sm">
                                        <i className="fas fa-magic"></i>
                                    </button>
                                    <button 
                                        title="Remove"
                                        onClick={() => onDeleteVideoFromPlaylist(source.id, video.id)}
                                        className="control-btn-sm delete-btn"
                                    >
                                        &times;
                                    </button>
                                </div>
                            </div>
                            {expandedItemId === video.id && video.chromaKey && (
                                <div className="item-settings">
                                    <h4>Chroma Key</h4>
                                    <ChromaKeySettings 
                                        settings={video.chromaKey}
                                        onUpdate={(newChromaSettings) => onUpdateVideoProperties(source.id, video.id, { chromaKey: newChromaSettings })}
                                    />
                                </div>
                            )}
                            {effectsExpanded === video.id && (
                                <div className="item-settings">
                                    <VideoEffects
                                        effects={video.effects || {}}
                                        onUpdate={(newEffects) => onUpdateVideoProperties(source.id, video.id, { effects: newEffects })}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="controls-section">
                {isPlaylistMode && currentVideo && (
                     <input 
                        type="range"
                        min="0"
                        max={currentVideo.duration || 0}
                        value={playlistCurrentTime}
                        onChange={(e) => onSeek(parseFloat(e.target.value))}
                        className="playback-slider"
                    />
                )}
                <div className="playlist-controls">
                    <button onClick={onPlayPause} disabled={playlist.length === 0}>
                        <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
                    </button>
                    <div className="volume-control">
                        <i className={`fas ${volume > 0 ? 'fa-volume-up' : 'fa-volume-mute'}`}></i>
                        <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.01" 
                            value={volume} 
                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                            className="volume-slider"
                        />
                    </div>
                    {isPlaylistMode && (
                         <span className="time-display">
                            {formatDuration(playlistCurrentTime)} / {currentVideo ? formatDuration(currentVideo.duration) : '00:00:00'}
                         </span>
                    )}
                    <span className="total-duration">Total: {formatDuration(totalDuration)}</span>
                </div>
            </div>
        </div>
    );
};

const Properties = ({ 
    selectedSource, 
    onOpenVideoLibrary,
    onOpenImageLibrary,
    onOpenAudioLibrary,
    isPlaying, 
    volume, 
    onPlayPause, 
    onVolumeChange,
    onModeChange,
    playlistCurrentTime,
    playlistCurrentIndex,
    onDeleteVideoFromPlaylist,
    onDeleteImageFromSource,
    onDeleteAudioFromSource,
    onUpdateVideoProperties,
    onUpdateImageProperties,
    onUpdateSourceProperties,
    onSeek,
    onUpdateAudioProperties,
    currentAudioTime,
    currentAudioIndex,
    onSeekAudio,
    muteOriginalVideo,
    onMuteOriginalVideoChange
}) => {
    
    const renderProperties = () => {
        if (!selectedSource) {
            return <p>Select a source to see its properties.</p>;
        }

        switch (selectedSource.type) {
            case 'video':
                return <VideoPlaylistProperties 
                            source={selectedSource} 
                            onOpenVideoLibrary={onOpenVideoLibrary}
                            isPlaying={isPlaying}
                            volume={volume}
                            onPlayPause={onPlayPause}
                            onVolumeChange={onVolumeChange}
                            onModeChange={onModeChange}
                            playlistCurrentTime={playlistCurrentTime}
                            playlistCurrentIndex={playlistCurrentIndex}
                            onDeleteVideoFromPlaylist={onDeleteVideoFromPlaylist}
                            onUpdateVideoProperties={onUpdateVideoProperties}
                            onSeek={onSeek}
                        />;
            case 'image':
                return <ImageSourceProperties
                            source={selectedSource}
                            onOpenImageLibrary={onOpenImageLibrary}
                            onDeleteImageFromSource={onDeleteImageFromSource}
                            onUpdateImageProperties={onUpdateImageProperties}
                        />;
            case 'audio':
                return <AudioSourceProperties
                            source={selectedSource}
                            onOpenAudioLibrary={onOpenAudioLibrary}
                            onDeleteAudioFromSource={onDeleteAudioFromSource}
                            isPlaying={isPlaying}
                            volume={volume}
                            onPlayPause={onPlayPause}
                            onVolumeChange={onVolumeChange}
                            onUpdateAudioProperties={onUpdateAudioProperties}
                            currentAudioTime={currentAudioTime}
                            currentAudioIndex={currentAudioIndex}
                            onSeekAudio={onSeekAudio}
                            muteOriginalVideo={muteOriginalVideo}
                            onMuteOriginalVideoChange={onMuteOriginalVideoChange}
                        />;
            case 'text':
                return <TextSourceProperties
                            source={selectedSource}
                            onUpdateSourceProperties={onUpdateSourceProperties}
                        />;
            case 'browser':
                return <BrowserSourceProperties
                            source={selectedSource}
                            onUpdateSourceProperties={onUpdateSourceProperties}
                        />;
            default:
                return <p>No properties available for this source type.</p>;
        }
    };

    return (
        <>
            <h3>Properties</h3>
            <div className="properties-content">
                {renderProperties()}
            </div>
        </>
    );
};

export default Properties;