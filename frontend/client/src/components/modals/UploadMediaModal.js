import React, { useState } from 'react';
import { uploadToMyGoogleDrive } from '../../services/api';
import '../../css/modules/_modal.css';
import LoadingSpinner from '../LoadingSpinner';

const UploadMediaModal = ({ onUploadComplete, onClose }) => {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!file) {
            alert('Please select a file to upload.');
            return;
        }

        setUploading(true);
        
        try {
            await uploadToMyGoogleDrive(file);
            alert('Upload to Google Drive successful!');
            onUploadComplete();
            onClose();
        } catch (error) {
            console.error(`Google Drive upload failed`, error);
            const errorMessage = error.response?.data?.detail || 'An unknown error occurred.';
            alert(`Google Drive upload failed: ${errorMessage}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                {uploading && <LoadingSpinner />}
                <div className="modal-header">
                    <h2>Upload to Google Drive</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="vps-form-modal">
                            <label htmlFor="file-upload">File</label>
                            <input
                                type="file"
                                id="file-upload"
                                name="file-upload"
                                onChange={handleFileChange}
                                required
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="submit" className="modal-btn" disabled={uploading}>
                            Upload
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UploadMediaModal;