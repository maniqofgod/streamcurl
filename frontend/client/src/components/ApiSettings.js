import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

const ApiSettings = () => {
    const [settings, setSettings] = useState({
        pixabay_api_key: '',
        youtube_api_key: '',
        google_fonts_api_key: ''
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [visible, setVisible] = useState({});
    const [validationStatus, setValidationStatus] = useState({});

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                setIsLoading(true);
                const data = await api.getApiSettings();
                setSettings(data);
                setError('');
            } catch (err) {
                setError('Failed to fetch API settings.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
        setValidationStatus(prev => ({ ...prev, [name.replace('_api_key', '')]: null }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            await api.updateApiSettings(settings);
            setSuccess('API settings updated successfully!');
        } catch (err) {
            setError('Failed to update API settings.');
            console.error(err);
        }
    };

    const toggleVisibility = (key) => {
        setVisible(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleCheckApiKey = async (apiKeyType) => {
        const apiKey = settings[`${apiKeyType}_api_key`];
        if (!apiKey) {
            setValidationStatus(prev => ({ ...prev, [apiKeyType]: 'Please enter a key.' }));
            return;
        }
        try {
            await api.checkApiKey(apiKeyType, apiKey);
            setValidationStatus(prev => ({ ...prev, [apiKeyType]: 'Valid' }));
        } catch (err) {
            setValidationStatus(prev => ({ ...prev, [apiKeyType]: 'Invalid' }));
        }
    };

    if (isLoading) {
        return <div>Loading settings...</div>;
    }

    return (
        <div className="admin-card">
            <h2 className="card-title">API Key Management</h2>
            {error && <div className="form-message error">{error}</div>}
            {success && <div className="form-message success">{success}</div>}
            <form onSubmit={handleSubmit} className="admin-form">
                <div className="form-group">
                    <label>Pixabay API Key</label>
                    <div className="input-with-button">
                        <div className="password-input-wrapper">
                            <input
                                type={visible.pixabay_input ? 'text' : 'password'}
                                name="pixabay_api_key"
                                value={settings.pixabay_api_key}
                                onChange={handleChange}
                                placeholder="Enter Pixabay API Key"
                            />
                            <i className={`fas ${visible.pixabay_input ? 'fa-eye-slash' : 'fa-eye'}`} onClick={() => toggleVisibility('pixabay_input')}></i>
                        </div>
                        <button type="button" className="glass-button" onClick={() => handleCheckApiKey('pixabay')}>Check</button>
                    </div>
                    {validationStatus.pixabay && <span className={`validation-status ${validationStatus.pixabay === 'Valid' ? 'valid' : 'invalid'}`}>{validationStatus.pixabay}</span>}
                </div>
                <div className="form-group">
                    <label>YouTube API Key</label>
                    <div className="input-with-button">
                        <div className="password-input-wrapper">
                            <input
                                type={visible.youtube_input ? 'text' : 'password'}
                                name="youtube_api_key"
                                value={settings.youtube_api_key}
                                onChange={handleChange}
                                placeholder="Enter YouTube API Key"
                            />
                            <i className={`fas ${visible.youtube_input ? 'fa-eye-slash' : 'fa-eye'}`} onClick={() => toggleVisibility('youtube_input')}></i>
                        </div>
                        <button type="button" className="glass-button" onClick={() => handleCheckApiKey('youtube')}>Check</button>
                    </div>
                    {validationStatus.youtube && <span className={`validation-status ${validationStatus.youtube === 'Valid' ? 'valid' : 'invalid'}`}>{validationStatus.youtube}</span>}
                </div>
                <div className="form-group">
                    <label>Google Fonts API Key</label>
                    <div className="input-with-button">
                        <div className="password-input-wrapper">
                            <input
                                type={visible.google_fonts_input ? 'text' : 'password'}
                                name="google_fonts_api_key"
                                value={settings.google_fonts_api_key}
                                onChange={handleChange}
                                placeholder="Enter Google Fonts API Key"
                            />
                            <i className={`fas ${visible.google_fonts_input ? 'fa-eye-slash' : 'fa-eye'}`} onClick={() => toggleVisibility('google_fonts_input')}></i>
                        </div>
                        <button type="button" className="glass-button" onClick={() => handleCheckApiKey('google_fonts')}>Check</button>
                    </div>
                    {validationStatus.google_fonts && <span className={`validation-status ${validationStatus.google_fonts === 'Valid' ? 'valid' : 'invalid'}`}>{validationStatus.google_fonts}</span>}
                </div>
                <button type="submit" className="glass-button">Save Settings</button>
            </form>

            <div className="card-section">
                <h3 className="section-title">Current API Keys</h3>
                <ul className="secret-list">
                    <li>
                        <span>Pixabay API Key</span>
                        <div className="password-input-wrapper">
                            <input type={visible.pixabay_list ? 'text' : 'password'} readOnly value={settings.pixabay_api_key} />
                            <i className={`fas ${visible.pixabay_list ? 'fa-eye-slash' : 'fa-eye'}`} onClick={() => toggleVisibility('pixabay_list')}></i>
                        </div>
                    </li>
                    <li>
                        <span>YouTube API Key</span>
                        <div className="password-input-wrapper">
                            <input type={visible.youtube_list ? 'text' : 'password'} readOnly value={settings.youtube_api_key} />
                            <i className={`fas ${visible.youtube_list ? 'fa-eye-slash' : 'fa-eye'}`} onClick={() => toggleVisibility('youtube_list')}></i>
                        </div>
                    </li>
                    <li>
                        <span>Google Fonts API Key</span>
                        <div className="password-input-wrapper">
                            <input type={visible.google_fonts_list ? 'text' : 'password'} readOnly value={settings.google_fonts_api_key} />
                            <i className={`fas ${visible.google_fonts_list ? 'fa-eye-slash' : 'fa-eye'}`} onClick={() => toggleVisibility('google_fonts_list')}></i>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default ApiSettings;