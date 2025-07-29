import React, { useState, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const Sources = ({ sources, selectedSourceId, onSelectSource, onAddSource, onDeleteSource, onUpdateSources }) => {
    const [isMenuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    const toggleMenu = () => setMenuOpen(!isMenuOpen);

    const handleDelete = (e, sourceId) => {
        e.stopPropagation(); // Prevent the source from being selected when deleting
        onDeleteSource(sourceId);
    };

    // Close menu if clicked outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menuRef]);

    const getIconForSource = (type) => {
        switch(type) {
            case 'video': return 'fas fa-video';
            case 'image': return 'fas fa-image';
            case 'audio': return 'fas fa-music';
            
            case 'text': return 'fas fa-font';
            default: return 'fas fa-file';
        }
    }

    const handleOnDragEnd = (result) => {
        if (!result.destination) return;
        const items = Array.from(sources);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        onUpdateSources(items);
    }

    return (
        <>
            <h3>Sources</h3>
            <div className="source-list-wrapper">
                <DragDropContext onDragEnd={handleOnDragEnd}>
                    <Droppable droppableId="sources">
                        {(provided) => (
                            <div className="source-list" {...provided.droppableProps} ref={provided.innerRef}>
                                {(sources || []).length > 0 ? (
                                    (sources || []).map((source, index) => (
                                        <Draggable key={source.id} draggableId={source.id} index={index}>
                                            {(provided) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                    className={`source-item ${selectedSourceId === source.id ? 'active' : ''}`}
                                                    onClick={() => onSelectSource(source.id)}
                                                >
                                                    <i className={getIconForSource(source.type)}></i>
                                                    <span>{source.name}</span>
                                                    <button className="delete-source-btn" onClick={(e) => handleDelete(e, source.id)}>&times;</button>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))
                                ) : (
                                    <div className="source-item-placeholder">
                                        <p>Click '+' to add a source.</p>
                                    </div>
                                )}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
                <div className="add-source-container" ref={menuRef}>
                    <button className="add-source-btn" onClick={toggleMenu}>+</button>
                    {isMenuOpen && (
                        <div className="add-source-menu">
                            <button onClick={() => { onAddSource('video'); setMenuOpen(false); }}><i className="fas fa-film"></i> Video Source</button>
                            <button onClick={() => { onAddSource('image'); setMenuOpen(false); }}><i className="fas fa-images"></i> Image Source</button>
                            <button onClick={() => { onAddSource('audio'); setMenuOpen(false); }}><i className="fab fa-soundcloud"></i> Audio Source</button>
                            
                             <button onClick={() => { onAddSource('browser'); setMenuOpen(false); }}><i className="fas fa-globe"></i> Browser Source</button>
                            <button onClick={() => { onAddSource('text'); setMenuOpen(false); }}><i className="fas fa-font"></i> Text Source</button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default Sources;