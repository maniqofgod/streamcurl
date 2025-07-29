import React, { useRef, useEffect } from 'react';

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

const ChromaKeyVideo = ({ src, chromaKeySettings, videoRef, isPlaying }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const processFrame = () => {
            if (video.paused || video.ended) {
                return;
            }
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (chromaKeySettings && chromaKeySettings.enabled) {
                const keyColorRgb = hexToRgb(chromaKeySettings.color);
                if (!keyColorRgb) return;

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const { r: keyR, g: keyG, b: keyB } = keyColorRgb;
                const similarity = chromaKeySettings.similarity || 0.1;
                const smoothness = chromaKeySettings.smoothness || 0.0;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];

                    const colorDistance = Math.sqrt(
                        Math.pow(r - keyR, 2) +
                        Math.pow(g - keyG, 2) +
                        Math.pow(b - keyB, 2)
                    ) / Math.sqrt(Math.pow(255, 2) * 3);

                    if (colorDistance < similarity) {
                        let alpha = 0;
                        if (smoothness > 0) {
                            const edge = similarity - smoothness;
                            if (colorDistance > edge) {
                                alpha = (colorDistance - edge) / smoothness;
                            }
                        }
                        data[i + 3] = alpha * 255;
                    }
                }
                ctx.putImageData(imageData, 0, 0);
            }
            animationFrameId = requestAnimationFrame(processFrame);
        };

        video.addEventListener('play', processFrame);

        return () => {
            video.removeEventListener('play', processFrame);
            cancelAnimationFrame(animationFrameId);
        };

    }, [src, chromaKeySettings, videoRef, isPlaying]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
};

export default ChromaKeyVideo;