import React, { useState, useEffect, useCallback } from 'react';
import UploadMediaModal from './UploadMediaModal';
import api, { searchPixabay, downloadPixabayImage } from '../../services/api';
import LoadingSpinner from '../LoadingSpinner';
import '../../css/modules/_modal.css';

const ImageLibraryModal = ({ isOpen, onClose, onSave }) => {
    const [activeTab, setActiveTab] = useState('library');
    const [images, setImages] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);

    // Library state
    const [loading, setLoading] = useState(false);
    
    // Search state
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchPage, setSearchPage] = useState(1);
    const [searchTotalPages, setSearchTotalPages] = useState(0);
    const [isUploadModalOpen, setUploadModalOpen] = useState(false);
    const [downloading, setDownloading] = useState(null);

    const fetchLibraryImages = useCallback(async () => {
        try {
            setLoading(true);
            // Use the full, absolute path to be certain
            const response = await api.get('/api/v1/gdrive/files/image');
            setImages(response.data || []);
        } catch (error) {
            console.error(`Error fetching Google Drive images:`, error);
            setImages([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen && activeTab === 'library') {
            fetchLibraryImages();
        } else if (!isOpen) {
            setSelectedImages([]);
        }
    }, [isOpen, activeTab, fetchLibraryImages]);

    const handleImageSelect = (image) => {
        setSelectedImages(prevSelected => {
            const isSelected = prevSelected.some(i => i.id === image.id);
            if (isSelected) {
                return prevSelected.filter(i => i.id !== image.id);
            } else {
                return [...prevSelected, image];
            }
        });
    };

    const handleSearch = async (page = 1) => {
        if (!query) return;
        setLoading(true);
        try {
            const data = await searchPixabay(query, page);
            setSearchResults(data.hits);
            setSearchPage(page);
            setSearchTotalPages(Math.ceil(data.totalHits / 20));
        } catch (error) {
            console.error("Pixabay search failed", error);
            alert("Failed to search Pixabay.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectPixabayImage = async (imageUrl, imageId) => {
        setDownloading(imageId);
        try {
            const downloadedImage = await downloadPixabayImage(imageUrl);
            // Refresh the library to show the newly uploaded image
            await fetchLibraryImages(); 
            // Select the image and switch to the library
            handleImageSelect(downloadedImage);
            setActiveTab('library');
        } catch (error) {
            console.error("Pixabay download failed", error);
            alert("Failed to download image from Pixabay.");
        } finally {
            setDownloading(null);
        }
    };

    const handleUseImages = () => {
        // The objects from GDrive need to be adapted for use in the editor
        const adaptedImages = selectedImages.map(img => ({
            id: img.id,
            gdrive_file_id: img.id, // Use GDrive ID
            display_name: img.name,
            source: 'gdrive',
            type: 'image',
            url: `/api/v1/gdrive/stream/${img.id}`, // URL for the full image/stream
            thumbnail_url: img.thumbnail_url, // Thumbnail URL
        }));
        onSave(adaptedImages);
        onClose();
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="modal-backdrop">
            <div className="modal-content large">
                <div className="modal-header">
                    <h2>Image Library</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="modal-body">
                    <div className="modal-tabs">
                        <button className="modal-btn" onClick={() => setUploadModalOpen(true)}>Upload Image</button>
                        <button className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>Library</button>
                        <button className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>Search Pixabay</button>
                    </div>
                    
                    {activeTab === 'library' && (
                        <>
                            <div className="media-library-grid">
                                {loading ? <LoadingSpinner /> : images.length > 0 ? (
                                    images.map(image => {
                                        const isSelected = selectedImages.some(i => i.id === image.id);
                                        // Use the thumbnail_url directly from the backend response
                                        const thumbnailUrl = image.thumbnail_url;

                                        return (
                                            <div 
                                                key={image.id} 
                                                className={`media-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => handleImageSelect(image)}
                                            >
                                                {thumbnailUrl ? (
                                                    <img src={thumbnailUrl} alt={image.name} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
                                                ) : (
                                                    <div className="no-thumbnail">No Preview</div>
                                                )}
                                                <p>{image.name}</p>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p>No images found in your Google Drive.</p>
                                )}
                            </div>
                            {/* Pagination is removed as it's not supported by the GDrive listing */}
                        </>
                    )}

                    {activeTab === 'search' && (
                        <div className="pixabay-search-container">
                            <div className="search-bar">
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search for images on Pixabay..."
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch(1)}
                                />
                                <button onClick={() => handleSearch(1)} disabled={loading}>
                                    {loading ? 'Searching...' : 'Search'}
                                </button>
                            </div>
                            <div className="pixabay-results-grid">
                                {loading ? (
                                    <LoadingSpinner />
                                ) : (
                                    searchResults.map(img => (
                                        <div key={img.id} className="media-item" onClick={() => !downloading && handleSelectPixabayImage(img.largeImageURL, img.id)}
                                            style={{ cursor: downloading ? 'not-allowed' : 'pointer' }}>
                                            <img
                                                src={img.previewURL}
                                                alt={img.tags}
                                            />
                                            {downloading === img.id && <div className="download-overlay"><LoadingSpinner /></div>}
                                        </div>
                                    ))
                                )}
                            </div>
                            {searchResults.length > 0 && (
                                <div className="pagination-controls">
                                    <button onClick={() => handleSearch(searchPage - 1)} disabled={searchPage <= 1 || loading}>
                                        Previous
                                    </button>
                                    <span>Page {searchPage} of {searchTotalPages}</span>
                                    <button onClick={() => handleSearch(searchPage + 1)} disabled={searchPage >= searchTotalPages || loading}>
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button onClick={handleUseImages} className="modal-btn use-btn" disabled={selectedImages.length === 0}>
                        Use ({selectedImages.length}) Image(s)
                    </button>
                </div>
                {isUploadModalOpen && (
                    <UploadMediaModal 
                        onClose={() => setUploadModalOpen(false)}
                        onUploadComplete={() => {
                            setUploadModalOpen(false);
                            fetchLibraryImages(); // Refresh library
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default ImageLibraryModal;
