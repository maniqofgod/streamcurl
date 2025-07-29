import React from 'react';
import { useParams } from 'react-router-dom';
import StreamBuilder from '../components/editor/StreamBuilder';

/**
 * EditorPage serves as a full-screen container for the main StreamBuilder component.
 * It extracts the stream ID from the URL and passes it to the builder.
 */
const Editor = () => {
    const { streamId } = useParams();
    // The StreamBuilder component now handles its own full-screen layout.
    // The wrapping div has been removed to prevent layout conflicts.
    return <StreamBuilder streamId={streamId} />;
};

export default Editor;