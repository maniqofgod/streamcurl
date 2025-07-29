import React, { useState, useEffect } from 'react';

const SchedulingOptions = ({ schedule, setSchedule }) => {
    const [showStartDate, setShowStartDate] = useState(schedule.start_option === 'schedule');
    const [showEndDate, setShowEndDate] = useState(schedule.end_option === 'schedule');
    const [showEndDuration, setShowEndDuration] = useState(schedule.end_option === 'duration');
    const [showRepeatDelay, setShowRepeatDelay] = useState(schedule.repeat);

    useEffect(() => {
        setShowStartDate(schedule.start_option === 'schedule');
        setShowEndDate(schedule.end_option === 'schedule');
        setShowEndDuration(schedule.end_option === 'duration');
        setShowRepeatDelay(schedule.repeat);
    }, [schedule]);

    useEffect(() => {
        if (schedule.end_option === 'never') {
            setSchedule(prev => ({ ...prev, repeat: false }));
        }
    }, [schedule.end_option, setSchedule]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;
        setSchedule(prev => ({ ...prev, [name]: val }));
    };

    return (
        <div className="form-container-v4">
            <h3>Scheduling Options</h3>
            
            <div className="form-group">
                <label>Start Date</label>
                <div className="radio-group">
                    <input type="radio" id="start-immediately" name="start_option" value="immediately" checked={schedule.start_option === 'immediately'} onChange={handleChange} />
                    <label htmlFor="start-immediately">Start Immediately</label>
                </div>
                <div className="radio-group">
                    <input type="radio" id="schedule-date" name="start_option" value="schedule" checked={schedule.start_option === 'schedule'} onChange={handleChange} />
                    <label htmlFor="schedule-date">Schedule a date</label>
                </div>
                {showStartDate && (
                    <input type="datetime-local" name="start_date" value={schedule.start_date || ''} onChange={handleChange} className="form-control mt-2" />
                )}
            </div>

            <div className="form-group">
                <label>End Date</label>
                <div className="radio-group">
                    <input type="radio" id="never-247" name="end_option" value="never" checked={schedule.end_option === 'never'} onChange={handleChange} />
                    <label htmlFor="never-247">Never (24/7)</label>
                </div>
                <div className="radio-group">
                    <input type="radio" id="until-video-ends" name="end_option" value="video_end" checked={schedule.end_option === 'video_end'} onChange={handleChange} />
                    <label htmlFor="until-video-ends">Until All Videos End</label>
                </div>
                <div className="radio-group">
                    <input type="radio" id="schedule-end-date" name="end_option" value="schedule" checked={schedule.end_option === 'schedule'} onChange={handleChange} />
                    <label htmlFor="schedule-end-date">Schedule End Time</label>
                </div>
                {showEndDate && (
                    <input type="datetime-local" name="end_date" value={schedule.end_date || ''} onChange={handleChange} className="form-control mt-2" />
                )}
                 <div className="radio-group">
                    <input type="radio" id="end-duration" name="end_option" value="duration" checked={schedule.end_option === 'duration'} onChange={handleChange} />
                    <label htmlFor="end-duration">End After a Set Duration</label>
                </div>
                {showEndDuration && (
                    <input type="number" name="end_duration_hours" value={schedule.end_duration_hours || ''} onChange={handleChange} className="form-control mt-2" placeholder="Enter hours"/>
                )}
            </div>

            <div className="form-group">
                <label>Repeat Stream</label>
                <div className="checkbox-group">
                    <input type="checkbox" id="repeat-stream" name="repeat" checked={schedule.repeat} onChange={handleChange} disabled={schedule.end_option === 'never'} />
                    <label htmlFor="repeat-stream">Loop Stream with Delay</label>
                </div>
                {showRepeatDelay && (
                     <input type="text" name="repeat_delay" value={schedule.repeat_delay || ''} onChange={handleChange} className="form-control mt-2" placeholder="e.g., 5m, 1h, 2d"/>
                )}
            </div>

        </div>
    );
};

export default SchedulingOptions;