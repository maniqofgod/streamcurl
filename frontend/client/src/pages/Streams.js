import React, { useState, useEffect, useRef, useReducer } from 'react';
import { Link } from 'react-router-dom';
import StreamCard from '../components/StreamCard';
import { getStreams, deleteStream, getStreamStatus } from '../services/api';
import '../css/modules/_stream_dashboard.css';

// Reducer function to manage stream state logic
function streamsReducer(state, action) {
    switch (action.type) {
        case 'SET_STREAMS':
            return action.payload;
        case 'UPDATE_STREAM': {
            const { stream_id, ...updateData } = action.payload;
            return state.map(stream =>
                stream.id === stream_id ? { ...stream, ...updateData } : stream
            );
        }
        case 'UPDATE_STREAM_STATS': {
            const { stream_id, stats } = action.payload;
            return state.map(stream =>
                stream.id === stream_id ? { ...stream, ...stats } : stream
            );
        }
        case 'DELETE_STREAM':
            return state.filter(stream => stream.id !== action.payload);
        default:
            return state;
    }
}

const Streams = () => {
    const [streams, dispatch] = useReducer(streamsReducer, []);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid');
    const socketsRef = useRef({});
    const reconnectTimersRef = useRef({});

    // This effect runs only ONCE on component mount to set up resilient WebSockets.
    useEffect(() => {
        const sockets = socketsRef.current;
        const reconnectTimers = reconnectTimersRef.current;
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsBaseUrl = `${wsProtocol}//${window.location.host}`;

        const connectSocket = (streamId) => {
            if (sockets[streamId] && (sockets[streamId].readyState === WebSocket.OPEN || sockets[streamId].readyState === WebSocket.CONNECTING)) {
                return;
            }

            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error("Authentication token not found. WebSocket connection aborted.");
                return;
            }

            const wsUrl = `${wsBaseUrl}/ws/stream_status/${streamId}`;
            const ws = new WebSocket(wsUrl);
            console.log(`Attempting to connect WebSocket for stream ${streamId} to ${wsUrl}`);

            ws.onopen = () => {
                console.log(`WebSocket for stream ${streamId} connected.`);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'stats_update') {
                        dispatch({ type: 'UPDATE_STREAM_STATS', payload: data });
                    } else {
                        dispatch({ type: 'UPDATE_STREAM', payload: data });
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', event.data, error);
                }
            };

            ws.onclose = (event) => {
                // Don't reconnect on normal closure or policy violation (auth error)
                if (event.code === 1000 || event.code === 1008) {
                    console.log(`WebSocket for stream ${streamId} closed permanently. Code: ${event.code}`);
                    delete sockets[streamId];
                    return;
                }
                console.log(`WebSocket for stream ${streamId} closed. Reconnecting in 5s...`);
                delete sockets[streamId];
                reconnectTimers[streamId] = setTimeout(() => connectSocket(streamId), 5000);
            };

            ws.onerror = (error) => {
                console.error(`WebSocket error for stream ${streamId}:`, error);
                ws.close();
            };
            
            sockets[streamId] = ws;
        };

        const initialFetch = async () => {
            setLoading(true);
            try {
                const fetchedStreams = await getStreams();
                dispatch({ type: 'SET_STREAMS', payload: fetchedStreams });
                fetchedStreams.forEach(stream => connectSocket(stream.id));
            } catch (error) {
                console.error("Failed to fetch streams:", error);
            } finally {
                setLoading(false);
            }
        };

        initialFetch();

        return () => {
            console.log("Closing all sockets and timers on component unmount.");
            Object.values(reconnectTimers).forEach(clearTimeout);
            reconnectTimersRef.current = {};

            Object.values(sockets).forEach(socket => {
                socket.onclose = null; 
                socket.close();
            });
            socketsRef.current = {};
        };
}, []);

    // This effect runs whenever the streams list changes to manage polling for transitional statuses.
    useEffect(() => {
        const pollingTimers = {};
        const TRANSITIONAL_STATUSES = ["QUEUED", "Downloading", "Processing", "Generating Thumbnail", "STARTING"];

        const pollStatus = async (streamId) => {
            try {
                const data = await getStreamStatus(streamId);
                // Only dispatch if there's a meaningful change to avoid unnecessary re-renders.
                const currentStream = streams.find(s => s.id === streamId);
                if (currentStream && (currentStream.status !== data.status || currentStream.download_progress !== data.progress)) {
                    dispatch({ 
                        type: 'UPDATE_STREAM', 
                        payload: { 
                            stream_id: streamId, 
                            status: data.status, 
                            download_progress: data.progress 
                        } 
                    });
                }
            } catch (error) {
                console.error(`Failed to poll status for stream ${streamId}:`, error);
                // Stop polling for this stream on error to prevent spamming a broken endpoint
                if (pollingTimers[streamId]) {
                    clearInterval(pollingTimers[streamId]);
                    delete pollingTimers[streamId];
                }
            }
        };

        streams.forEach(stream => {
            if (TRANSITIONAL_STATUSES.includes(stream.status) && !pollingTimers[stream.id]) {
                console.log(`Starting status polling for stream ${stream.id} (status: ${stream.status})`);
                pollingTimers[stream.id] = setInterval(() => pollStatus(stream.id), 3000);
            }
        });

        return () => {
            console.log("Cleaning up polling timers.");
            Object.values(pollingTimers).forEach(clearInterval);
        };
    }, [streams]);

    const handleStreamUpdate = (updatedStream) => {
        dispatch({ type: 'UPDATE_STREAM', payload: { stream_id: updatedStream.id, ...updatedStream } });
    };
    
    const handleDeleteStream = async (streamId) => {
        if (window.confirm('Are you sure you want to delete this stream?')) {
            try {
                if (reconnectTimersRef.current[streamId]) {
                    clearTimeout(reconnectTimersRef.current[streamId]);
                    delete reconnectTimersRef.current[streamId];
                }
                if (socketsRef.current[streamId]) {
                    socketsRef.current[streamId].onclose = null; // Disable reconnect before closing
                    socketsRef.current[streamId].close();
                    delete socketsRef.current[streamId];
                }
                await deleteStream(streamId);
                dispatch({ type: 'DELETE_STREAM', payload: streamId });
            } catch (error) {
                console.error(`Failed to delete stream ${streamId}:`, error);
                alert('Failed to delete the stream.');
            }
        }
    };

    if (loading) {
        return <div>Loading streams...</div>;
    }

    return (
        <div style={{ padding: '30px' }}>
            <div className="page-controls">
                <div className="search-and-filter">
                    <div className="search-bar">
                        <i className="fas fa-search"></i>
                        <input type="text" placeholder="Search streams..." />
                    </div>
                    <div className="view-controls">
                        <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} aria-label="Grid View">
                            <i className="fas fa-th-large"></i>
                        </button>
                        <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} aria-label="List View">
                            <i className="fas fa-bars"></i>
                        </button>
                    </div>
                </div>
                <Link to="/editor" className="primary-btn">
                    <i className="fas fa-plus"></i> New Stream
                </Link>
            </div>

            <div className={viewMode === 'grid' ? 'card-grid' : 'list-container'}>
                {streams.map(stream => (
                    <StreamCard 
                        key={stream.id} 
                        stream={stream} 
                        onDelete={handleDeleteStream}
                        viewMode={viewMode}
                        onStreamUpdate={handleStreamUpdate}
                    />
                ))}
            </div>
        </div>
    );
};

export default Streams;