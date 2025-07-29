import os
import re
from typing import Optional
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import logging

logger = logging.getLogger(__name__)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
if not YOUTUBE_API_KEY:
    logger.warning("YOUTUBE_API_KEY environment variable is not set. YouTube features will be disabled.")
    youtube_service = None
else:
    try:
        youtube_service = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
    except Exception as e:
        logger.error(f"Failed to initialize YouTube service: {e}")
        youtube_service = None

def parse_iso8601_duration(duration_str: str) -> int:
    """
    Parses an ISO 8601 duration string (e.g., PT2M34S) into seconds.
    """
    if not duration_str or not duration_str.startswith('PT'):
        return 0
    
    hours = 0
    minutes = 0
    seconds = 0

    # Remove 'PT' prefix
    duration_str = duration_str[2:]

    if 'H' in duration_str:
        parts = duration_str.split('H')
        hours = int(parts[0])
        duration_str = parts[1]
    
    if 'M' in duration_str:
        parts = duration_str.split('M')
        minutes = int(parts[0])
        duration_str = parts[1]

    if 'S' in duration_str:
        seconds = int(duration_str.replace('S', ''))

    return hours * 3600 + minutes * 60 + seconds

def extract_video_id_from_url(url: str) -> Optional[str]:
    """
    Extracts the YouTube video ID from a URL.
    Supports standard, shortened, and embed URLs.
    """
    patterns = [
        r'(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})',
        r'(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})',
        r'(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
        r'(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})',
        r'(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def get_video_stats(video_id: str) -> Optional[dict]:
    """
    Fetches video statistics, duration, and live viewer count from the YouTube Data API.
    """
    if not youtube_service:
        logger.error("YouTube service is not available. Cannot fetch video stats.")
        return None

    try:
        request = youtube_service.videos().list(
            part="statistics,contentDetails,liveStreamingDetails",
            id=video_id
        )
        response = request.execute()

        if not response.get("items"):
            logger.warning(f"No video found with ID: {video_id}")
            return None

        item = response["items"][0]
        stats = item.get("statistics", {})
        content_details = item.get("contentDetails", {})
        
        duration_iso = content_details.get("duration")
        duration_seconds = parse_iso8601_duration(duration_iso) if duration_iso else 0

        live_streaming_details = item.get("liveStreamingDetails", {})
        live_viewers = int(live_streaming_details.get("concurrentViewers", 0))

        return {
            "view_count": int(stats.get("viewCount", 0)),
            "like_count": int(stats.get("likeCount", 0)),
            "comment_count": int(stats.get("commentCount", 0)),
            "duration_seconds": duration_seconds,
            "live_viewers": live_viewers,
        }
    except HttpError as e:
        logger.error(f"An HTTP error {e.resp.status} occurred: {e.content}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred while fetching YouTube stats: {e}")
        return None

def get_live_broadcast_status(video_id: str) -> Optional[str]:
    """
    Fetches the live broadcast status of a YouTube video.
    """
    if not youtube_service:
        logger.error("YouTube service is not available. Cannot fetch broadcast status.")
        return None

    try:
        request = youtube_service.videos().list(
            part="snippet,liveStreamingDetails",
            id=video_id
        )
        response = request.execute()

        if not response.get("items"):
            logger.warning(f"No video found with ID for broadcast status check: {video_id}")
            return "not_found"

        video_item = response["items"][0]
        # Check for live streaming details
        if "liveStreamingDetails" in video_item:
            # For an active or upcoming live stream
            return video_item["snippet"].get("liveBroadcastContent", "none")
        
        # If it's a regular video or a completed stream, it won't have liveStreamingDetails
        # and liveBroadcastContent will be 'none' in the snippet.
        return video_item["snippet"].get("liveBroadcastContent", "none")

    except HttpError as e:
        logger.error(f"An HTTP error {e.resp.status} occurred while checking broadcast status: {e.content}")
        # Specific handling for 404 Not Found
        if e.resp.status == 404:
            return "not_found"
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred while checking broadcast status: {e}")
        return None