import React from 'react';
import './LoadingSpinner.css';
import logo from '../logo.svg'; // Import the logo

const LoadingSpinner = ({ size = 'medium' }) => {
    return (
        <div className={`loading-spinner-container ${size}`}>
            <img src={logo} className="loading-spinner" alt="Loading..." />
        </div>
    );
};

export default LoadingSpinner;