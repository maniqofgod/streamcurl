import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rnd } from 'react-rnd';

import './_stream_builder.css';
import StreamDetails from './StreamDetails';
import SchedulingOptions from './SchedulingOptions';
import Platforms from './Platforms';
import AdvancedSettings from './AdvancedSettings';
import Sources from './Sources';
import Properties from './Properties';
import VideoLibraryModal from '../modals/VideoLibraryModal';
import ImageLibraryModal from '../modals/ImageLibraryModal';
import AudioLibraryModal from '../modals/AudioLibraryModal';
import ChromaKeyImage from './ChromaKeyImage';
import ChromaKeyVideo from './ChromaKeyVideo';

import { createStream, getStream, updateStream, getCurrentUser, readVpsList, adminReadVpsList, goLiveStream, stopStream, linkYoutube, getStreamStatus } from '../../services/api';

const useHistory = (initialState) => {
    const [index, setIndex] = useState(0);
    const [history, setHistory] = useState([initialState]);

    const setState = React.useCallback((action, overwrite = false) => {
        const newState = typeof action === 'function' ? action(history[index]) : action;
        if (overwrite) {
            const historyCopy = [...history];
            historyCopy[index] = newState;
            setHistory(historyCopy);
        } else {
            const updatedHistory = history.slice(0, index + 1);
            setHistory([...updatedHistory, newState]);
            setIndex(index + 1);
        }
    }, [history, index]);

    const undo = () => index > 0 && setIndex(index - 1);
    const redo = () => index < history.length - 1 && setIndex(index + 1);

    return [history[index], setState, undo, redo, index > 0, index < history.length - 1];
};

const BASE_RESOLUTIONS = {
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
};


const StreamBuilder = ({ streamId }) => {
    const [stream, setStream] = useState({ name: '' });
    const [schedule, setSchedule] = useState({
        start_option: 'immediately',
        start_date: null,
        end_option: 'never',
        end_date: null,
        end_duration_hours: '',
        repeat: false,
        repeat_delay: ''
    });
    const [platforms, setPlatforms] = useState({
        youtube_stream_key: ''
    });
    const [advancedSettings, setAdvancedSettings] = useState({
        resolution: '1280x720',
        transcode_mode: 'vbr',
        video_bitrate: '3000',
        video_fps: '30',
        audio_bitrate: '160',
        mute_original_video: false
    });
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [isVideolibraryModalOpen, setVideoLibraryModalOpen] = useState(false);
    const [isImageLibraryModalOpen, setImageLibraryModalOpen] = useState(false);
    const [isAudioLibraryModalOpen, setAudioLibraryModalOpen] = useState(false);
    
    const [sources, setSources, undoSources, redoSources, canUndo, canRedo] = useHistory([]);
    
    const [selectedSourceId, setSelectedSourceId] = useState(null);
    const navigate = useNavigate();

    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const videoRefs = useRef({});
    const audioRefs = useRef({});
    const canvasRef = useRef(null);
    
    const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0, scale: 1 });

    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const intervalRef = useRef(null);

    const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
    const [currentAudioTime, setCurrentAudioTime] = useState(0);
    
    const audioIntervalRef = useRef(null);

    const [vpsList, setVpsList] = useState([]);
    const [selectedVpsId, setSelectedVpsId] = useState(null);
    const [userRole, setUserRole] = useState(null);

    const [streamStatus, setStreamStatus] = useState('Idle');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const user = await getCurrentUser();
                setUserRole(user.role);

                let vpsData;
                if (user.role === 'admin') {
                    vpsData = await adminReadVpsList();
                } else {
                    vpsData = await readVpsList();
                }
                setVpsList(vpsData);

                if (streamId) {
                    const fetchedStream = await getStream(streamId);
                    setStream(fetchedStream); // Set the whole stream object
                    setSelectedVpsId(fetchedStream.vps_id);
                    setStreamStatus(fetchedStream.status);
                    
                    if (fetchedStream.settings) {
                        const settings = fetchedStream.settings || {};
                        const {
                            aspectRatio: fetchedAspectRatio = '16:9',
                            sources: sourcesData = [],
                            schedule: fetchedSchedule = {},
                            platforms: fetchedPlatforms = {},
                            advanced: fetchedAdvanced = {}
                        } = settings;

                        setAspectRatio(fetchedAspectRatio);
                        const baseResolution = BASE_RESOLUTIONS[fetchedAspectRatio];

                        const normalizedSources = (sourcesData || []).map(source => {
                            const defaultTransform = { x: 0, y: 0, width: baseResolution.width, height: baseResolution.height };
                            const defaultChromaKey = { enabled: false, color: '#00ff00', similarity: 0.1, smoothness: 0.05, spill: 0.05 };
                            
                            const newSource = { ...source };

                            const processItems = (items) => {
                                return items.map(item => {
                                    const newItem = { ...item };
                                    if (newItem.storage_type === 'gdrive' && newItem.gdrive_file_id && !newItem.filepath) {
                                        const itemType = source.type === 'image' ? 'thumbnail' : 'stream';
                                        newItem.filepath = `gdrive/${itemType}/${newItem.gdrive_file_id}`;
                                    }
                                    
                                    if (source.type === 'video' || source.type === 'image') {
                                        newItem.transform = newItem.transform || defaultTransform;
                                        newItem.chromaKey = newItem.chromaKey || defaultChromaKey;
                                    }
                                    if (source.type === 'video') {
                                        newItem.effects = newItem.effects || { grayscale: { enabled: false }, sepia: { enabled: false }, blur: { enabled: false, strength: 0 } };
                                    }
                                    return newItem;
                                });
                            };

                            if (newSource.type === 'video') {
                                newSource.playlist = processItems(newSource.playlist || newSource.video_items || []);
                                delete newSource.video_items;
                            } else if (newSource.type === 'image') {
                                newSource.items = processItems(newSource.items || newSource.image_items || []);
                                delete newSource.image_items;
                            } else if (newSource.type === 'audio') {
                                const audioItems = newSource.items || newSource.audio_items || [];
                                newSource.items = processItems(audioItems).map(audio => ({
                                    ...audio,
                                    loop: audio.loop || false
                                }));
                                delete newSource.audio_items;
                            } else if (newSource.type === 'text') {
                                newSource.transform = newSource.transform || defaultTransform;
                                newSource.effect = newSource.effect || 'none';
                            }
                            return newSource;
                        });
                        setSources(normalizedSources, true);

                        setSchedule(prev => ({ ...prev, ...fetchedSchedule }));
                        setPlatforms(prev => ({ ...prev, ...fetchedPlatforms }));
                        setAdvancedSettings(prev => ({ ...prev, ...fetchedAdvanced }));
                    }
                }
            } catch (error) {
                console.error("Failed to fetch initial data:", error);
                alert("Failed to load data. Please try again.");
                navigate('/streams');
            }
        };
        fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamId, navigate]);

    useEffect(() => {
        const updateCanvasSize = () => {
            if (canvasRef.current) {
                const container = canvasRef.current.parentElement;
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                
                const baseResolution = BASE_RESOLUTIONS[aspectRatio];
                const targetRatio = baseResolution.width / baseResolution.height;

                let newWidth, newHeight;
                if (containerWidth / containerHeight > targetRatio) {
                    newHeight = containerHeight;
                    newWidth = newHeight * targetRatio;
                } else {
                    newWidth = containerWidth;
                    newHeight = newWidth / targetRatio;
                }

                setCanvasDimensions({
                    width: newWidth,
                    height: newHeight,
                    scale: newWidth / baseResolution.width,
                });
            }
        };

        const resizeObserver = new ResizeObserver(updateCanvasSize);
        const parentElement = canvasRef.current?.parentElement;
        if (parentElement) {
            resizeObserver.observe(parentElement);
        }
        
        updateCanvasSize();

        return () => {
            if (parentElement) {
                resizeObserver.unobserve(parentElement);
            }
        };
    }, [aspectRatio]);

    const selectedSource = (sources || []).find(s => s.id === selectedSourceId);
    const isPlaylistMode = selectedSource?.playbackMode === 'playlist';

    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    // Effect for Video Playback
    useEffect(() => {
        const safePlay = (element) => {
            if (element && typeof element.play === 'function') {
                const playPromise = element.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'AbortError') {
                            console.error("Playback error:", error);
                        }
                    });
                }
            }
        };

        const safePause = (element) => {
            if (element && typeof element.pause === 'function') {
                element.pause();
            }
        };

        if (isPlaying) {
            sources.forEach(source => {
                if (source.type === 'video') {
                    if (source.id === selectedSourceId && isPlaylistMode) {
                        const currentVideo = source.playlist?.[currentVideoIndex];
                        if (currentVideo) {
                            const videoEl = videoRefs.current[currentVideo.id];
                            safePlay(videoEl);
                        }
                    } else {
                        source.playlist.forEach(video => {
                            const videoEl = videoRefs.current[video.id];
                            safePlay(videoEl);
                        });
                    }
                }
            });
        } else {
            Object.values(videoRefs.current).forEach(safePause);
        }

        if (isPlaying && selectedSource?.type === 'video' && isPlaylistMode) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                const currentVideo = selectedSource.playlist?.[currentVideoIndex];
                if (currentVideo) {
                    const videoEl = videoRefs.current[currentVideo.id];
                    if (videoEl) {
                        setCurrentTime(videoEl.currentTime);
                        if (videoEl.currentTime >= videoEl.duration - 0.5) {
                            if (currentVideo.loop) {
                                videoEl.currentTime = 0;
                                safePlay(videoEl);
                            } else {
                                setCurrentVideoIndex(prevIndex => (prevIndex + 1) % selectedSource.playlist.length);
                                setCurrentTime(0);
                            }
                        }
                    }
                }
            }, 250);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }

    }, [isPlaying, sources, selectedSource, selectedSourceId, currentVideoIndex, isPlaylistMode]);

    // Effect for Audio Playback
    useEffect(() => {
        const safePlay = (element) => {
            if (element && typeof element.play === 'function') {
                const playPromise = element.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error.name !== 'AbortError') {
                            console.error("Playback error:", error);
                        }
                    });
                }
            }
        };

        const safePause = (element) => {
            if (element && typeof element.pause === 'function') {
                element.pause();
            }
        };

        const audioSource = (sources ?? []).find(s => s.type === 'audio');
        const audioPlaylist = audioSource?.items;

        if (isPlaying && audioPlaylist && audioPlaylist.length > 0) {
            const currentAudio = audioPlaylist[currentAudioIndex];
            if (!currentAudio) return;

            Object.entries(audioRefs.current).forEach(([audioId, audioEl]) => {
                const isCurrent = audioId === String(currentAudio.id);
                if (audioEl) {
                    audioEl.volume = volume;
                    if (isCurrent) {
                        safePlay(audioEl);
                    } else {
                        safePause(audioEl);
                    }
                }
            });

            if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
            audioIntervalRef.current = setInterval(() => {
                const audioEl = audioRefs.current[currentAudio.id];
                if (audioEl) {
                    setCurrentAudioTime(audioEl.currentTime);
                    if (audioEl.currentTime >= audioEl.duration - 0.5) {
                        if (currentAudio.loop) {
                            audioEl.currentTime = 0;
                            safePlay(audioEl);
                        } else {
                            const nextIndex = currentAudioIndex + 1;
                            if (nextIndex < audioPlaylist.length) {
                                setCurrentAudioIndex(nextIndex);
                                setCurrentAudioTime(0);
                            } else {
                                // End of playlist, reset to beginning and pause
                                setCurrentAudioIndex(0);
                                setCurrentAudioTime(0);
                                setIsPlaying(false); 
                            }
                        }
                    }
                }
            }, 250);

        } else {
            if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
            Object.values(audioRefs.current).forEach(safePause);
        }

        return () => {
            if (audioIntervalRef.current) {
                clearInterval(audioIntervalRef.current);
            }
        };
    }, [isPlaying, sources, volume, currentAudioIndex]);
    
    const openVideoLibraryModal = () => setVideoLibraryModalOpen(true);
    const closeVideoLibraryModal = () => setVideoLibraryModalOpen(false);

    const openImageLibraryModal = () => setImageLibraryModalOpen(true);
    const closeImageLibraryModal = () => setImageLibraryModalOpen(false);

    const openAudioLibraryModal = () => setAudioLibraryModalOpen(true);
    const closeAudioLibraryModal = () => setAudioLibraryModalOpen(false);

    const handleAddSource = (type) => {
        let newSource;

        switch (type) {
            case 'video':
                newSource = {
                    id: `video-playlist-${Date.now()}`,
                    type: 'video',
                    name: 'Video Playlist',
                    playlist: [],
                    playbackMode: 'individual',
                };
                break;
            case 'image':
                newSource = {
                    id: `image-source-${Date.now()}`,
                    type: 'image',
                    name: 'Image Source',
                    items: [],
                };
                break;
            case 'audio':
                newSource = {
                    id: `audio-source-${Date.now()}`,
                    type: 'audio',
                    name: 'Audio Source',
                    items: [],
                };
                break;
            case 'text':
                newSource = {
                    id: `text-source-${Date.now()}`,
                    type: 'text',
                    name: 'Text Source',
                    text: 'Hello, World!',
                    font: 'Arial',
                    size: 48,
                    color: '#FFFFFF',
                    effect: 'none',
                    transform: { x: 100, y: 100, width: 400, height: 100 },
                };
                break;
            default:
                console.error("Unsupported source type:", type);
                return;
        }

        if (newSource) {
            setSources(prev => [...(Array.isArray(prev) ? prev : []), newSource]);
            setSelectedSourceId(newSource.id);
        }
    };

    const handleDeleteSource = (sourceIdToDelete) => {
        setSources(prev => prev.filter(s => s.id !== sourceIdToDelete));
        if (selectedSourceId === sourceIdToDelete) setSelectedSourceId(null);
    };

    const handleUpdateSources = (newSources) => {
        setSources(newSources);
    };

    const handleAddImagesToPlaylist = (selectedImages) => {
        if (!selectedImages || selectedImages.length === 0) {
            closeImageLibraryModal();
            return;
        }
        const baseResolution = BASE_RESOLUTIONS[aspectRatio];
        setSources(prev => prev.map(source => {
            if (source.id === selectedSourceId && source.type === 'image') {
                const newImages = selectedImages.map(img => {
                    const imageData = {
                        ...img,
                        transform: { x: 0, y: 0, width: baseResolution.width, height: baseResolution.height },
                        chromaKey: {
                            enabled: false,
                            color: '#00ff00',
                            similarity: 0.1,
                            smoothness: 0.05,
                            spill: 0.05
                        },
                    };

                    // If it's a GDrive image, set storage type and ID, similar to video handling
                    if (img.source === 'gdrive') {
                        imageData.storage_type = 'gdrive';
                        imageData.gdrive_file_id = img.id;
                        // Use the thumbnail endpoint for the image source
                        imageData.filepath = `gdrive/thumbnail/${img.id}`; 
                    }
                    
                    return imageData;
                });
                const existingItems = Array.isArray(source.items) ? source.items : [];
                return { ...source, items: [...existingItems, ...newImages] };
            }
            return source;
        }));
        closeImageLibraryModal();
    };

    const handleAddAudiosToPlaylist = (selectedAudios) => {
        if (!selectedAudios || selectedAudios.length === 0) {
            closeAudioLibraryModal();
            return;
        }
        setSources(prev => prev.map(source => {
            if (source.id === selectedSourceId && source.type === 'audio') {
                const newAudios = selectedAudios.map(aud => {
                    const audioData = {
                        ...aud,
                        loop: false,
                        // Ensure `type` is explicitly set for `getMediaUrl` logic
                        type: 'audio', 
                    };
    
                    // The modal provides `gdrive_id`. We need to handle this to create the correct filepath.
                    // We also standardize on `gdrive_file_id` for consistency with saving/loading.
                    if (aud.source === 'gdrive' && aud.gdrive_id) {
                        audioData.storage_type = 'gdrive';
                        audioData.filepath = `gdrive://${aud.gdrive_id}`;
                        audioData.gdrive_file_id = aud.gdrive_id;
                    }
                    
                    return audioData;
                });
                const existingItems = Array.isArray(source.items) ? source.items : [];
                return { ...source, items: [...existingItems, ...newAudios] };
            }
            return source;
        }));
        closeAudioLibraryModal();
    };

    const handleSelectVideo = (selectedVideos) => {
        if (!selectedVideos || selectedVideos.length === 0) {
            closeVideoLibraryModal();
            return;
        }
        const baseResolution = BASE_RESOLUTIONS[aspectRatio];
        setSources(prev => prev.map(source => {
            if (source.id === selectedSourceId && source.type === 'video') {
                const newVideos = selectedVideos.map(v => {
                    const videoData = {
                        ...v,
                        transform: { x: 0, y: 0, width: baseResolution.width, height: baseResolution.height },
                        muted: false,
                        loop: false,
                        chromaKey: {
                            enabled: false,
                            color: '#00ff00',
                            similarity: 0.1,
                            smoothness: 0.05,
                            spill: 0.05
                        },
                        effects: {
                            grayscale: { enabled: false },
                            sepia: { enabled: false },
                            blur: { enabled: false, strength: 0 }
                        },
                    };

                    // If it's a GDrive video, set storage type and ID
                    if (v.source === 'gdrive') {
                        videoData.storage_type = 'gdrive';
                        videoData.gdrive_file_id = v.id;
                        // Use the stream endpoint for the video source
                        videoData.filepath = `gdrive/stream/${v.id}`; 
                    }
                    
                    return videoData;
                });
                const existingPlaylist = Array.isArray(source.playlist) ? source.playlist : [];
                return { ...source, playlist: [...existingPlaylist, ...newVideos] };
            }
            return source;
        }));
        closeVideoLibraryModal();
    };

    const updateSourceItemTransform = (sourceId, itemId, itemType, newTransformProps, addToHistory = false) => {
        setSources(prevSources => {
            return prevSources.map(s => {
                if (s.id === sourceId) {
                    const key = itemType === 'video' ? 'playlist' : 'items';
                    const updatedItems = s[key].map(i => {
                        if (i.id === itemId) {
                            return { ...i, transform: { ...i.transform, ...newTransformProps } };
                        }
                        return i;
                    });
                    return { ...s, [key]: updatedItems };
                }
                return s;
            });
        }, !addToHistory);
    };

    const handleUpdateSourceProperties = (sourceId, newProps, addToHistory = false) => {
        setSources(prev => prev.map(s => {
            if (s.id === sourceId) {
                const updatedSource = { ...s };
                // Iterate over the new properties and apply them
                for (const key in newProps) {
                    // If the property is 'transform', merge it with the existing transform object
                    if (key === 'transform' && typeof newProps[key] === 'object' && newProps[key] !== null && typeof s[key] === 'object' && s[key] !== null) {
                        updatedSource.transform = { ...s.transform, ...newProps.transform };
                    } else {
                        // Otherwise, just overwrite the property
                        updatedSource[key] = newProps[key];
                    }
                }
                return updatedSource;
            }
            return s;
        }), !addToHistory);
    };

    const handleUpdateAudioProperties = (sourceId, audioId, newProps) => {
        setSources(prev => prev.map(s => {
            if (s.id === sourceId) {
                return { ...s, items: s.items.map(i => i.id === audioId ? { ...i, ...newProps } : i) };
            }
            return s;
        }));
    };

    const handleSeekAudio = (newTime) => {
        const audioSource = sources.find(s => s.type === 'audio');
        if (!audioSource) return;
        
        const currentAudio = audioSource.items?.[currentAudioIndex];
        if (!currentAudio) return;

        const audioEl = audioRefs.current[currentAudio.id];
        if (audioEl) {
            const clampedTime = Math.max(0, Math.min(newTime, audioEl.duration));
            audioEl.currentTime = clampedTime;
            setCurrentAudioTime(clampedTime);
        }
    };

    const handleMuteOriginalVideoChange = (checked) => {
        setAdvancedSettings(prev => ({ ...prev, mute_original_video: checked }));
    };

    const handlePlaybackModeChange = (sourceId, mode) => {
        setSources(prev => prev.map(s => s.id === sourceId ? { ...s, playbackMode: mode } : s));
        setCurrentVideoIndex(0);
        setCurrentTime(0);
    };

    const handleDeleteVideoFromPlaylist = (sourceId, videoId) => {
        setSources(prev => prev.map(s => {
            if (s.id === sourceId) {
                const newPlaylist = s.playlist.filter(v => v.id !== videoId);
                return { ...s, playlist: newPlaylist };
            }
            return s;
        }));
    };
    
    const handleDeleteImageFromSource = (sourceId, imageId) => {
        setSources(prev => prev.map(s => {
            if (s.id === sourceId) {
                const newItems = s.items.filter(i => i.id !== imageId);
                return { ...s, items: newItems };
            }
            return s;
        }));
    };

    const handleDeleteAudioFromSource = (sourceId, audioId) => {
        setSources(prev => prev.map(s => {
            if (s.id === sourceId) {
                const newItems = s.items.filter(i => i.id !== audioId);
                return { ...s, items: newItems };
            }
            return s;
        }));
    };

    const handleUpdateVideoProperties = (sourceId, videoId, newProps) => {
        setSources(prev => prev.map(s => {
            if (s.id === sourceId) {
                const newPlaylist = s.playlist.map(v => {
                    if (v.id === videoId) {
                        const updatedVideo = { ...v };

                        if (newProps.chromaKey) {
                            updatedVideo.chromaKey = { ...v.chromaKey, ...newProps.chromaKey };
                        }

                        if (newProps.effects) {
                            const newEffects = { ...(v.effects || {}) };
                            for (const effectKey in newProps.effects) {
                                if (typeof newProps.effects[effectKey] === 'object' && newProps.effects[effectKey] !== null && newEffects[effectKey]) {
                                    newEffects[effectKey] = { ...newEffects[effectKey], ...newProps.effects[effectKey] };
                                } else {
                                    newEffects[effectKey] = newProps.effects[effectKey];
                                }
                            }
                            updatedVideo.effects = newEffects;
                        }
                        
                        const otherProps = {...newProps};
                        delete otherProps.chromaKey;
                        delete otherProps.effects;

                        return { ...updatedVideo, ...otherProps };
                    }
                    return v;
                });
                return { ...s, playlist: newPlaylist };
            }
            return s;
        }));
    };

    const handleUpdateImageProperties = (sourceId, imageId, newProps) => {
        setSources(prev => prev.map(s => {
            if (s.id === sourceId) {
                const newItems = s.items.map(i => {
                    if (i.id === imageId) {
                        const updatedImage = { ...i };
                        if (newProps.chromaKey) {
                            updatedImage.chromaKey = { ...i.chromaKey, ...newProps.chromaKey };
                        }
                        
                        const otherProps = {...newProps};
                        delete otherProps.chromaKey;

                        return { ...updatedImage, ...otherProps };
                    }
                    return i;
                });
                return { ...s, items: newItems };
            }
            return s;
        }));
    };

    const handleSeek = (newTime) => {
        if (!selectedSource) return;
        
        if (isPlaylistMode) {
            const currentVideo = selectedSource.playlist?.[currentVideoIndex];
            if (!currentVideo) return;
            const videoEl = videoRefs.current[currentVideo.id];
            if (videoEl) {
                const clampedTime = Math.max(0, Math.min(newTime, videoEl.duration));
                videoEl.currentTime = clampedTime;
                setCurrentTime(clampedTime);
            }
        }
    };

    const calculateBestGrid = (count, containerWidth, containerHeight) => {
        let bestLayout = { cols: count, rows: 1, area: 0 };
        for (let cols = 1; cols <= count; cols++) {
            const rows = Math.ceil(count / cols);
            const cellWidth = containerWidth / cols;
            const cellHeight = containerHeight / rows;
            const area = cellWidth * cellHeight;
            const aspectRatioPenalty = Math.abs(cols / rows - containerWidth / containerHeight);
            const score = area / (1 + aspectRatioPenalty);
            if (score > bestLayout.area) {
                bestLayout = { cols, rows, area: score };
            }
        }
        return { cols: bestLayout.cols, rows: bestLayout.rows };
    };

    const handleAutoFit = () => {
        if (!canvasRef.current || !selectedSource) return;
        const baseResolution = BASE_RESOLUTIONS[aspectRatio];
        const canvasWidth = baseResolution.width;
        const canvasHeight = baseResolution.height;
        
        const itemsToFit = selectedSource.type === 'video' 
            ? selectedSource.playlist 
            : (selectedSource.type === 'image' ? selectedSource.items : []);

        if (!itemsToFit || itemsToFit.length === 0) return;

        const { cols, rows } = calculateBestGrid(itemsToFit.length, canvasWidth, canvasHeight);
        const cellWidth = canvasWidth / cols;
        const cellHeight = canvasHeight / rows;
        let itemIndex = 0;

        const updatedItems = itemsToFit.map(item => {
            const gridCol = itemIndex % cols;
            const gridRow = Math.floor(itemIndex / cols);
            const cellX = gridCol * cellWidth;
            const cellY = gridRow * cellHeight;
            const itemAspectRatio = item.naturalWidth && item.naturalHeight ? item.naturalWidth / item.naturalHeight : 16 / 9;
            const cellAspectRatio = cellWidth / cellHeight;
            let newWidth, newHeight;
            if (itemAspectRatio > cellAspectRatio) {
                newWidth = cellWidth;
                newHeight = newWidth / itemAspectRatio;
            } else {
                newHeight = cellHeight;
                newWidth = newHeight * itemAspectRatio;
            }
            const newX = cellX + (cellWidth - newWidth) / 2;
            const newY = cellY + (cellHeight - newHeight) / 2;
            itemIndex++;
            return { ...item, transform: { width: Math.round(newWidth), height: Math.round(newHeight), x: Math.round(newX), y: Math.round(newY) } };
        });

        setSources(prevSources => prevSources.map(source => {
            if (source.id === selectedSourceId) {
                if (source.type === 'video') {
                    return { ...source, playlist: updatedItems };
                } else if (source.type === 'image') {
                    return { ...source, items: updatedItems };
                }
            }
            return source;
        }));
    };

    

    const handleSaveStream = async () => {
        if (!stream.name.trim()) {
            alert("Please enter a stream name.");
            return;
        }

        const sanitizedSources = sources.map(source => {
            const baseSource = {
                id: source.id,
                type: source.type,
                name: source.name,
            };

            switch (source.type) {
                case 'video':
                    return {
                        ...baseSource,
                        playlist: (source.playlist || []).map(video => {
                            const videoPayload = {
                                id: String(video.id),
                                display_name: video.display_name || 'Untitled Video',
                                duration: video.duration,
                                width: video.naturalWidth,
                                height: video.naturalHeight,
                                transform: video.transform || {},
                                muted: video.muted || false,
                                loop: video.loop || false,
                                effects: video.effects || {},
                                chromaKey: video.chromaKey || {},
                                storage_type: video.storage_type || 'local',
                                filepath: video.filepath, // Always include filepath
                            };

                            if (video.storage_type === 'gdrive') {
                                videoPayload.gdrive_file_id = video.id;
                            }
                            
                            return videoPayload;
                        }),
                        playbackMode: source.playbackMode || 'individual',
                    };
                case 'image':
                    return {
                        ...baseSource,
                        items: (source.items || []).map(image => {
                            const imagePayload = {
                                id: String(image.id),
                                display_name: image.display_name || image.name || 'Untitled Image',
                                filepath: image.filepath,
                                transform: image.transform || {},
                                chromaKey: image.chromaKey || {},
                                storage_type: image.storage_type || 'local',
                            };

                            if (image.storage_type === 'gdrive') {
                                imagePayload.gdrive_file_id = String(image.gdrive_file_id || image.id);
                            }
                            
                            return imagePayload;
                        }),
                    };
                case 'audio':
                    return {
                        ...baseSource,
                        audio_items: (source.items || []).map(audio => {
                            const audioPayload = {
                                id: String(audio.id),
                                display_name: audio.display_name,
                                filepath: audio.filepath,
                                duration: audio.duration,
                                loop: audio.loop || false,
                                storage_type: audio.storage_type || 'local',
                            };

                            if (audio.storage_type === 'gdrive') {
                                audioPayload.gdrive_file_id = String(audio.gdrive_file_id || audio.id);
                            }
                            
                            return audioPayload;
                        }),
                        volume: source.volume ?? 1.0,
                    };
                case 'text':
                    return {
                        ...baseSource,
                        text: source.text || '',
                        font: source.font || 'Arial',
                        size: source.size || 48,
                        color: source.color || '#FFFFFF',
                        effect: source.effect || 'none',
                        transform: source.transform || {},
                    };
                default:
                    // Return a minimal object for unknown types
                    return baseSource;
            }
        });

        const sanitizedSchedule = {
            ...schedule,
            start_date: schedule.start_date || null,
            end_date: schedule.end_date || null,
        };

        const streamData = {
            name: stream.name,
            description: stream.description,
            youtube_video_url: stream.youtube_video_url,
            youtube_view_count: stream.youtube_view_count,
            youtube_like_count: stream.youtube_like_count,
            youtube_comment_count: stream.youtube_comment_count,
            settings: {
                sources: sanitizedSources,
                aspectRatio: aspectRatio,
                schedule: sanitizedSchedule,
                platforms: platforms,
                advanced: advancedSettings,
            },
            vps_id: selectedVpsId,
        };

        setIsLoading(true);
        try {
            if (streamId) {
                await updateStream(streamId, streamData);
            } else {
                await createStream(streamData);
            }
            navigate('/streams');
        } catch (error) {
            console.error("Failed to save stream:", error);
            let errorMessage = "An unknown error occurred.";
            if (error.response?.data?.detail) {
                if (Array.isArray(error.response.data.detail)) {
                    errorMessage = error.response.data.detail.map(err => {
                        const field = err.loc.join(' -> ');
                        return `${field}: ${err.msg}`;
                    }).join('\n');
                } else {
                    errorMessage = JSON.stringify(error.response.data.detail, null, 2);
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            alert(`Error saving stream:\n${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoLive = async () => {
        setIsLoading(true);
        try {
            await goLiveStream(streamId);
            setStreamStatus('Running');
            alert("Stream is now LIVE!");
        } catch (error) {
            console.error("Failed to go live:", error);
            alert("Error going live. Please check the logs.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStopStream = async () => {
        setIsLoading(true);
        try {
            await stopStream(streamId);
            setStreamStatus('Idle');
            alert("Stream stopped.");
        } catch (error) {
            console.error("Failed to stop stream:", error);
            alert("Error stopping stream. Please check the logs.");
        } finally {
            setIsLoading(false);
        }
    };

    const handlePlayPause = () => setIsPlaying(!isPlaying);
    const handleVolumeChange = (newVolume) => setVolume(newVolume);

    const hasMediaSources = (sources || []).some(s => 
        (s.type === 'video' && s.playlist && s.playlist.length > 0) ||
        (s.type === 'image' && s.items && s.items.length > 0)
    );
    const handleLinkYouTube = async () => {
        if (!streamId) {
            alert("Please save the stream first before linking a YouTube video.");
            return;
        }
        if (!stream.youtube_url) {
            alert("Please enter a YouTube URL.");
            return;
        }

        setIsLoading(true);
        try {
            const updatedStream = await linkYoutube(streamId, { youtube_url: stream.youtube_url });
            alert(`Successfully linked YouTube video! Views: ${updatedStream.youtube_view_count}, Likes: ${updatedStream.youtube_like_count}`);
            // Optionally, you can update parts of your state with the new stats
            // For example: setStream(prev => ({ ...prev, ...updatedStream }));
        } catch (error) {
            console.error("Failed to link YouTube video:", error);
            const errorMessage = error.response?.data?.detail || "An unknown error occurred.";
            alert(`Error linking video: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    const getMediaUrl = (item) => {
        if (!item) return '';
    
        const isVideo = item.type === 'video' || (item.mime_type && item.mime_type.startsWith('video/'));
        const isAudio = item.type === 'audio' || (item.mime_type && item.mime_type.startsWith('audio/'));
    
        // Handle GDrive items using the gdrive:// URI scheme
        if (item.filepath && item.filepath.startsWith('gdrive://')) {
            const fileId = item.filepath.substring('gdrive://'.length);
            if (isVideo || isAudio) {
                return `/api/v1/gdrive/stream/${fileId}`;
            }
            // Default to thumbnail for images or other types
            return `/api/v1/gdrive/thumbnail/${fileId}`;
        }
    
        // Handle legacy GDrive paths (for backward compatibility)
        if (item.storage_type === 'gdrive') {
            const fileId = item.gdrive_file_id || item.id;
            if (!fileId) return '';
    
            if (isVideo || isAudio) {
                return `/api/v1/gdrive/stream/${fileId}`;
            }
            return `/api/v1/gdrive/thumbnail/${fileId}`;
        }
    
        // Handle local files
        if (item.filepath) {
            // Assuming local files are served from an endpoint that mirrors their path
            return `/api/v1/${item.filepath}`;
        }
    
        // Fallback for external URLs (e.g., YouTube thumbnails)
        if (item.thumbnail_url) {
            return item.thumbnail_url;
        }
    
        return '';
    };
    const { scale } = canvasDimensions;

    return (
        <div className="edit-layout-v4">
            
            <div className="editor-top-bar">
                <button onClick={() => navigate('/streams')} className="editor-action-btn back-btn">Back to All Streams</button>
                <div className="editor-main-actions">
                    <button onClick={handleSaveStream} className="editor-action-btn save-btn" disabled={isLoading}>Save</button>
                    {streamStatus === 'Previewing' && <button onClick={handleGoLive} className="editor-action-btn go-live-btn" disabled={isLoading}>Go Live</button>}
                    {(streamStatus === 'Previewing' || streamStatus === 'Running') && <button onClick={handleStopStream} className="editor-action-btn stop-btn" disabled={isLoading}>Stop</button>}
                </div>
            </div>

            <div className="side-panel left-panel">
                <StreamDetails stream={stream} setStream={setStream} onLinkYouTube={handleLinkYouTube} />
                <SchedulingOptions schedule={schedule} setSchedule={setSchedule} />
            </div>

            <div className="main-content-panel">
                <div className="canvas-container-v4">
                    <div className="stream-builder-header">
                        <h3>Stream Builder</h3>
                        <div className="stream-builder-actions">
                            <button className={`control-btn ${aspectRatio === '16:9' ? 'active' : ''}`} onClick={() => setAspectRatio('16:9')}>16:9</button>
                            <button className={`control-btn ${aspectRatio === '9:16' ? 'active' : ''}`} onClick={() => setAspectRatio('9:16')}>9:16</button>
                            <button className="control-btn" onClick={handleAutoFit} disabled={!selectedSource}>Auto Fit</button>
                            <button className="control-btn" onClick={undoSources} disabled={!canUndo}>Undo</button>
                            <button className="control-btn" onClick={redoSources} disabled={!canRedo}>Redo</button>
                        </div>
                    </div>
                    <div className="canvas-wrapper">
                        <div 
                            ref={canvasRef} 
                            className="canvas-placeholder" 
                            style={{
                                width: canvasDimensions.width,
                                height: canvasDimensions.height,
                            }}
                        >
                            {(sources || []).map(source => {
                                if (source.type === 'video' && source.playlist) {
                                    const videosToRender = (source.playbackMode === 'playlist' && source.id === selectedSourceId)
                                        ? (source.playlist[currentVideoIndex] ? [source.playlist[currentVideoIndex]] : [])
                                        : source.playlist;

                                    return videosToRender.filter(video => video.filepath).map(video => (
                                        <Rnd
                                            key={video.id}
                                            size={{ width: video.transform.width * scale, height: video.transform.height * scale }}
                                            position={{ x: video.transform.x * scale, y: video.transform.y * scale }}
                                            onDragStop={(e, d) => {
                                                updateSourceItemTransform(source.id, video.id, 'video', { x: d.x / scale, y: d.y / scale }, true);
                                            }}
                                            onResizeStop={(e, dir, ref, delta, pos) => {
                                                updateSourceItemTransform(source.id, video.id, 'video', { 
                                                    width: parseFloat(ref.style.width) / scale, 
                                                    height: parseFloat(ref.style.height) / scale, 
                                                    x: pos.x / scale,
                                                    y: pos.y / scale
                                                }, true);
                                            }}
                                            className={selectedSourceId === source.id ? 'selected-source-rnd' : ''}
                                        >
                                            <>
                                                <video
                                                    ref={el => videoRefs.current[video.id] = el}
                                                    src={getMediaUrl(video)}
                                                    style={{ display: video.chromaKey?.enabled ? 'none' : 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                                                    loop={video.loop}
                                                    muted={video.muted || advancedSettings.mute_original_video || volume === 0}
                                                    onLoadedMetadata={(e) => {
                                                        const { videoWidth, videoHeight, duration } = e.currentTarget;
                                                        handleUpdateVideoProperties(source.id, video.id, { 
                                                            duration,
                                                            naturalWidth: videoWidth,
                                                            naturalHeight: videoHeight
                                                        });
                                                    }}
                                                    crossOrigin="anonymous"
                                                />
                                                {video.chromaKey?.enabled && (
                                                    <ChromaKeyVideo
                                                        src={getMediaUrl(video)}
                                                        chromaKeySettings={video.chromaKey}
                                                        videoRef={{ current: videoRefs.current[video.id] }}
                                                        isPlaying={isPlaying}
                                                    />
                                                )}
                                            </>
                                        </Rnd>
                                    ));
                                } else if (source.type === 'image' && source.items) {
                                    return source.items.filter(image => image.filepath || image.gdrive_file_id).map(image => (
                                        <Rnd
                                            key={image.id}
                                            size={{ width: image.transform.width * scale, height: image.transform.height * scale }}
                                            position={{ x: image.transform.x * scale, y: image.transform.y * scale }}
                                            onDragStop={(e, d) => {
                                                updateSourceItemTransform(source.id, image.id, 'image', { x: d.x / scale, y: d.y / scale }, true);
                                            }}
                                            onResizeStop={(e, dir, ref, delta, pos) => {
                                                updateSourceItemTransform(source.id, image.id, 'image', { 
                                                    width: parseFloat(ref.style.width) / scale, 
                                                    height: parseFloat(ref.style.height) / scale, 
                                                    x: pos.x / scale,
                                                    y: pos.y / scale
                                                }, true);
                                            }}
                                            className={selectedSourceId === source.id ? 'selected-source-rnd' : ''}
                                        >
                                            {image.chromaKey?.enabled ? (
                                                <ChromaKeyImage 
                                                    src={getMediaUrl(image)}
                                                    chromaKeySettings={image.chromaKey}
                                                    isSelected={selectedSourceId === source.id}
                                                />
                                            ) : (
                                                <img
                                                    src={getMediaUrl(image)}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    alt={image.display_name || image.name}
                                                    onLoad={(e) => {
                                                        const { naturalWidth, naturalHeight } = e.currentTarget;
                                                        handleUpdateImageProperties(source.id, image.id, {
                                                            naturalWidth,
                                                            naturalHeight
                                                        });
                                                    }}
                                                    crossOrigin="anonymous"
                                                />
                                            )}
                                        </Rnd>
                                    ));
                                } else if (source.type === 'audio' && source.items) {
                                    return source.items.filter(audio => audio.filepath).map(audio => (
                                        <audio
                                            key={audio.id}
                                            ref={el => audioRefs.current[audio.id] = el}
                                            src={getMediaUrl(audio)}
                                            loop={audio.loop}
                                            onLoadedMetadata={(e) => {
                                                const duration = e.currentTarget.duration;
                                                if (audio.duration !== duration) {
                                                    handleUpdateAudioProperties(source.id, audio.id, { duration });
                                                }
                                            }}
                                            crossOrigin="anonymous"
                                        />
                                    ));
                                } else if (source.type === 'text') {
                                    const item = source; // for consistency
                                    return (
                                        <Rnd
                                            key={item.id}
                                            size={{ width: item.transform.width * scale, height: item.transform.height * scale }}
                                            position={{ x: item.transform.x * scale, y: item.transform.y * scale }}
                                            onDragStop={(e, d) => {
                                                handleUpdateSourceProperties(item.id, { transform: { x: d.x / scale, y: d.y / scale } }, true);
                                            }}
                                            onResizeStop={(e, dir, ref, delta, pos) => {
                                                handleUpdateSourceProperties(item.id, { 
                                                    transform: {
                                                        width: parseFloat(ref.style.width) / scale, 
                                                        height: parseFloat(ref.style.height) / scale,
                                                        x: pos.x / scale,
                                                        y: pos.y / scale
                                                    } 
                                                }, true);
                                            }}
                                            className={selectedSourceId === source.id ? 'selected-source-rnd' : ''}
                                        >
                                            <div style={{
                                                fontFamily: item.font,
                                                fontSize: `${item.size}px`,
                                                color: item.color,
                                                width: '100%',
                                                height: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word'
                                            }} className={`${
                                                item.effect === 'glow' ? 'text-effect-glow' :
                                                item.effect === 'shadow' ? 'text-effect-shadow' :
                                                item.effect === 'typing' ? 'text-effect-typing' :
                                                item.effect === 'fade_in' ? 'text-effect-fade-in' : ''
                                            }`}>
                                                {item.text}
                                            </div>
                                        </Rnd>
                                    );
                                }
                                return null;
                            })}
                            {!hasMediaSources && (<p>Add a media source to see a preview.</p>)}
                        </div>
                    </div>
                </div>
                <div className="bottom-panel-v4">
                    <div className="sources-panel-v4">
                        <Sources 
                            sources={sources} 
                            selectedSourceId={selectedSourceId}
                            onSelectSource={setSelectedSourceId}
                            onAddSource={handleAddSource}
                            onDeleteSource={handleDeleteSource}
                            onUpdateSources={handleUpdateSources}
                        />
                    </div>
                    <div className="properties-panel-v4">
                        <Properties 
                            selectedSource={selectedSource} 
                            onOpenVideoLibrary={openVideoLibraryModal}
                            onOpenImageLibrary={openImageLibraryModal}
                            onOpenAudioLibrary={openAudioLibraryModal}
                            isPlaying={isPlaying}
                            volume={volume}
                            onPlayPause={handlePlayPause}
                            onVolumeChange={handleVolumeChange}
                            onModeChange={handlePlaybackModeChange}
                            playlistCurrentTime={currentTime}
                            playlistCurrentIndex={currentVideoIndex}
                            onDeleteVideoFromPlaylist={handleDeleteVideoFromPlaylist}
                            onDeleteImageFromSource={handleDeleteImageFromSource}
                            onDeleteAudioFromSource={handleDeleteAudioFromSource}
                            onUpdateVideoProperties={handleUpdateVideoProperties}
                            onUpdateImageProperties={handleUpdateImageProperties}
                            onUpdateSourceProperties={handleUpdateSourceProperties}
                            onSeek={handleSeek}
                            muteOriginalVideo={advancedSettings.mute_original_video}
                            onMuteOriginalVideoChange={handleMuteOriginalVideoChange}
                            onUpdateAudioProperties={handleUpdateAudioProperties}
                            currentAudioTime={currentAudioTime}
                            currentAudioIndex={currentAudioIndex}
                            onSeekAudio={handleSeekAudio}
                        />
                    </div>
                </div>
            </div>

            <div className="side-panel right-panel">
                <Platforms 
                    platforms={platforms} 
                    setPlatforms={setPlatforms} 
                    streamId={streamId}
                    onStreamUpdate={setStream}
                />
                <AdvancedSettings 
                    settings={advancedSettings} 
                    setSettings={setAdvancedSettings} 
                    canvasAspectRatio={aspectRatio}
                    vpsList={vpsList}
                    selectedVpsId={selectedVpsId}
                    onVpsChange={setSelectedVpsId}
                    userRole={userRole}
                />
            </div>

            {isVideolibraryModalOpen && (<VideoLibraryModal isOpen={isVideolibraryModalOpen} onClose={closeVideoLibraryModal} onSave={handleSelectVideo} />)}
            {isImageLibraryModalOpen && (<ImageLibraryModal isOpen={isImageLibraryModalOpen} onClose={closeImageLibraryModal} onSave={handleAddImagesToPlaylist} />)}
            {isAudioLibraryModalOpen && (<AudioLibraryModal isOpen={isAudioLibraryModalOpen} onClose={closeAudioLibraryModal} onSave={handleAddAudiosToPlaylist} />)}
        </div>
    );
};

export default StreamBuilder;
