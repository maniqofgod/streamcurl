import React from 'react';

const VideoEffects = ({ effects, onUpdate }) => {
    const safeEffects = {
        grayscale: { enabled: false },
        sepia: { enabled: false },
        blur: { enabled: false, strength: 0 },
        ...(effects || {})
    };

    const handleCheckboxChange = (effectName, checked) => {
        onUpdate({ [effectName]: { ...(safeEffects[effectName] || {}), enabled: checked } });
    };

    const handleEffectChange = (effectName, value) => {
        onUpdate({ [effectName]: value });
    };

    return (
        <div className="video-effects-settings">
            <h4>Video Effects</h4>
            <div className="effect-group">
                <label>
                    <input
                        type="checkbox"
                        checked={safeEffects.grayscale.enabled}
                        onChange={(e) => handleCheckboxChange('grayscale', e.target.checked)}
                    />
                    Grayscale
                </label>
            </div>
            <div className="effect-group">
                <label>
                    <input
                        type="checkbox"
                        checked={safeEffects.sepia.enabled}
                        onChange={(e) => handleCheckboxChange('sepia', e.target.checked)}
                    />
                    Sepia
                </label>
            </div>
            <div className="effect-group">
                <label>
                    <input
                        type="checkbox"
                        checked={safeEffects.blur.enabled}
                        onChange={(e) => handleCheckboxChange('blur', e.target.checked)}
                    />
                    Blur
                </label>
                {safeEffects.blur.enabled && (
                    <div className="effect-controls">
                        <label htmlFor="blur-strength">Strength</label>
                        <input
                            type="range"
                            id="blur-strength"
                            min="0"
                            max="50"
                            step="1"
                            value={safeEffects.blur.strength}
                            onChange={(e) => handleEffectChange('blur', { ...safeEffects.blur, strength: parseInt(e.target.value) })}
                        />
                        <span>{safeEffects.blur.strength}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoEffects;