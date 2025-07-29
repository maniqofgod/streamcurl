import React, { useRef, useEffect } from 'react';

// Helper function to convert hex color to RGB
const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

// Helper for smoothstep function, not native in JS Math
const smoothstep = (edge0, edge1, x) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};


const ChromaKeyImage = ({ src, chromaKeySettings, isSelected }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = src;

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            if (chromaKeySettings && chromaKeySettings.enabled) {
                const keyColorRgb = hexToRgb(chromaKeySettings.color);
                if (!keyColorRgb) return;

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const { r: keyR, g: keyG, b: keyB } = keyColorRgb;
                
                const similarity = chromaKeySettings.similarity || 0.1;
                const smoothness = chromaKeySettings.smoothness || 0.0;
                const spill = chromaKeySettings.spill || 0.0;

                const maxDist = Math.sqrt(255*255 * 3);

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];

                    const distance = Math.sqrt(
                        Math.pow(r - keyR, 2) +
                        Math.pow(g - keyG, 2) +
                        Math.pow(b - keyB, 2)
                    ) / maxDist;

                    let alpha = 1.0;
                    if (distance < similarity) {
                        const t = smoothness > 0 ? smoothstep(similarity - smoothness, similarity, distance) : (distance < similarity ? 0 : 1);
                        alpha = t;

                        if (spill > 0) {
                            const desaturate = 1.0 - smoothstep(similarity, similarity + spill, distance);
                            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                            data[i] = r * (1 - desaturate) + gray * desaturate;
                            data[i + 1] = g * (1 - desaturate) + gray * desaturate;
                            data[i + 2] = b * (1 - desaturate) + gray * desaturate;
                        }
                    }
                    data[i + 3] = alpha * 255;
                }
                ctx.putImageData(imageData, 0, 0);
            }
        };

        img.onerror = () => {
            console.error("Failed to load image for chroma keying:", src);
        };

    }, [src, chromaKeySettings]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: isSelected ? 'none' : 'auto' }} />;
};

export default ChromaKeyImage;