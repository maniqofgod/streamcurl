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
    const [libraryPage, setLibraryPage] = useState(1);
    const [, setLibraryTotalPages] = useState(0);
    // sourceType is now fixed to 'gdrive'
    

    // Search state
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchPage, setSearchPage] = useState(1);
    const [searchTotalPages, setSearchTotalPages] = useState(0);
    const [isUploadModalOpen, setUploadModalOpen] = useState(false);
    const [downloading, setDownloading] = useState(null); // Tracks the ID of the image being downloaded

    const fetchLibraryImages = useCallback(async (page) => {
        try {
            setLoading(true);
            // Always fetch from Google Drive
            const response = await api.get('/gdrive/files/image');
            setImages(response.data);
            setLibraryTotalPages(1); // GDrive doesn't have pagination in this implementation
        } catch (error) {
            console.error(`Error fetching gdrive images:`, error);
            setImages([]);
        } finally {
            setLoading(false);
        }
    }, []); // No longer depends on sourceType

    useEffect(() => {
        if (isOpen && activeTab === 'library') {
            fetchLibraryImages(libraryPage);
        } else if (!isOpen) {
            setLibraryPage(1);
            setSelectedImages([]);
        }
    }, [isOpen, activeTab, libraryPage, fetchLibraryImages]);

    const handleImageSelect = (image) => {
        setSelectedImages(prevSelected => {
            if (prevSelected.find(i => i.id === image.id)) {
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
        onSave(selectedImages);
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
                            {/* Source toggle is removed */}
                            <div className="media-library-grid">
                                {images.length > 0 ? (
                                    images.map(image => {
                                        const isSelected = selectedImages.some(i => i.id === image.id);
                                        // All images are from GDrive now
                                        const thumbnailUrl = `/api/v1/gdrive/thumbnail/${image.id}`;

                                        return (
                                            <div 
                                                key={image.id} 
                                                className={`media-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => handleImageSelect(image)}
                                            >
                                                <img src={thumbnailUrl} alt={image.display_name || image.name} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
                                                <p>{image.display_name || image.name}</p>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p>No images found in your Google Drive.</p>
                                )}
                            </div>
                            {/* Pagination for local is removed */}
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
                            fetchLibraryImages(1); // Refresh library
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default ImageLibraryModal;
