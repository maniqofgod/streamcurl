import React, { useState } from 'react';
import { searchPixabay } from '../../services/api';
import api from '../../services/api'; // Import the api instance
import '../../css/modules/_modal.css';
import LoadingSpinner from '../LoadingSpinner'; // Assuming you have a spinner component

const ImageSearchModal = ({ onSelect, onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(null); // Tracks the ID of the image being downloaded

    const handleSearch = async () => {
        if (!query) return;
        setLoading(true);
        try {
            const data = await searchPixabay(query);
            setResults(data.hits);
        } catch (error) {
            console.error("Pixabay search failed", error);
            alert("Failed to search Pixabay.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectImage = async (imageUrl, imageId) => {
        setDownloading(imageId); // Start loading for this image
        try {
            const response = await api.post('/overlays/download_pixabay', { url: imageUrl });
            const downloadedImage = response.data;
            
            let imageUrlPath = downloadedImage.filepath;
            if (downloadedImage.storage_type === 'gdrive') {
                // For GDrive, we might need a specific endpoint to serve the file or a direct link
                // Assuming a structure like /media/gdrive/{file_id} which the backend will handle
                imageUrlPath = `/api/v1/gdrive/thumbnail/${downloadedImage.gdrive_file_id}`;
            }

            onSelect({
                url: `/${imageUrlPath}`,
                name: downloadedImage.display_name
            });
            onClose();
        } catch (error) {
            console.error("Pixabay download failed", error);
            const errorMessage = error.response?.data?.detail || "Failed to download image from Pixabay.";
            alert(errorMessage);
        } finally {
            setDownloading(null); // Stop loading
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Search Pixabay for Images</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="search-bar">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search for images..."
                        />
                        <button onClick={handleSearch} disabled={loading}>
                            {loading ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                    <div className="results-grid">
                        {loading ? (
                            <LoadingSpinner />
                        ) : (
                            results.map(img => (
                                <div key={img.id} className="result-item">
                                    <img
                                        src={img.previewURL}
                                        alt={img.tags}
                                        onClick={() => !downloading && handleSelectImage(img.largeImageURL, img.id)}
                                        style={{ cursor: downloading ? 'not-allowed' : 'pointer' }}
                                    />
                                    {downloading === img.id && <div className="download-overlay"><LoadingSpinner /></div>}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageSearchModal;