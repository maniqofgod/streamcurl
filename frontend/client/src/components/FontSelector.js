import React, { useState, useEffect, useRef } from 'react';
import './FontSelector.css';

const loadGoogleFont = (fontFamily) => {
    const fontId = `google-font-${fontFamily.replace(/\s/g, '-')}`;
    if (document.getElementById(fontId)) {
        return;
    }
    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css?family=${fontFamily.replace(/\s/g, '+')}`;
    document.head.appendChild(link);
};

const FontSelector = ({ selectedFont, fonts, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        // Preload the selected font
        if (selectedFont) {
            loadGoogleFont(selectedFont);
        }
    }, [selectedFont]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const handleSelect = (font) => {
        loadGoogleFont(font);
        onChange(font);
        setIsOpen(false);
    };

    return (
        <div className="font-selector" ref={wrapperRef}>
            <button className="font-selector-trigger" onClick={() => setIsOpen(!isOpen)} style={{ fontFamily: selectedFont }}>
                {selectedFont}
                <span className={`arrow ${isOpen ? 'up' : 'down'}`}></span>
            </button>
            {isOpen && (
                <div className="font-selector-options">
                    {fonts.map(font => (
                        <div
                            key={font}
                            className="font-selector-option"
                            style={{ fontFamily: font }}
                            onMouseEnter={() => loadGoogleFont(font)}
                            onClick={() => handleSelect(font)}
                        >
                            {font}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FontSelector;