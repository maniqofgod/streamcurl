import subprocess
from typing import Optional, Tuple, Union, Dict
from urllib.parse import urlparse
import requests
from app.db.models import Stream
from sqlalchemy.orm import Session
import logging
import os
import json
import shutil
import requests
import tempfile
from app.services.gdrive_service import get_direct_download_url
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

FILTER_FILES_DIR = tempfile.gettempdir()

def get_filter_file_path(stream_id: int) -> str:
    """Returns the path to the filter file for a given stream."""
    return os.path.join(FILTER_FILES_DIR, f"stream_{stream_id}_filter.txt")

def write_text_filter_file(stream_id: int, settings: Dict):
    """
    Writes the drawtext filter commands to a specific file for a stream.
    This allows for live updates by overwriting the file.
    """
    filter_path = get_filter_file_path(stream_id)
    
    db = SessionLocal()
    try:
        stream = db.query(Stream).filter(Stream.id == stream_id).first()
        if not stream:
            logger.error(f"Stream not found when writing filter file for stream_id: {stream_id}")
            return

        advanced = settings.get('advanced', {})
        output_resolution = advanced.get('resolution', '1280x720').split('x')
        output_w, output_h = int(output_resolution[0]), int(output_resolution[1])
        base_w, base_h = 1280, 720
        scale_x = output_w / base_w
        scale_y = output_h / base_h

        text_filters = []
        for source in settings.get('sources', []):
            if source.get('type') == 'text':
                def escape_ffmpeg_text(text):
                    return text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")

                font_file = f"/app/fonts/{source.get('font', 'Arial')}.ttf"
                if not os.path.exists(font_file):
                    font_file = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

                text_to_draw = escape_ffmpeg_text(source.get('text', ''))
                transform = source.get('transform', {})
                x = int(transform.get('x', 0) * scale_x)
                y = int(transform.get('y', 0) * scale_y)
                size = int(source.get('size', 48) * min(scale_x, scale_y))
                color = source.get('color', '#FFFFFF').replace('#', '0x')
                
                text_filters.append(
                    f"drawtext=fontfile='{font_file}':text='{text_to_draw}':"
                    f"x={x}:y={y}:fontsize={size}:fontcolor={color}"
                )
        
        filter_chain = ",".join(text_filters)

        with open(filter_path, "w") as f:
            f.write(filter_chain)
        logger.info(f"Successfully wrote filter file for stream {stream_id} to {filter_path}")

    finally:
        db.close()

def update_stream_settings(stream_id: int, new_settings: Dict):
    """
    Updates the settings for a live stream, specifically by rewriting the text filter file.
    """
    logger.info(f"Updating live settings for stream {stream_id}")
    write_text_filter_file(stream_id, new_settings)


def generate_thumbnail_from_stream(video_stream_chunk: bytes) -> Optional[bytes]:
    """
    Generates a thumbnail from a video stream chunk using FFmpeg.
    This version writes the chunk to a temporary file for stability.
    """
    tmp_file_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            tmp.write(video_stream_chunk)
            tmp_file_path = tmp.name

        command = [
            'ffmpeg',
            '-analyzeduration', '2M',
            '-probesize', '2M',
            '-i', tmp_file_path,
            '-ss', '00:00:00.5',
            '-vframes', '1',
            '-f', 'image2',
            '-c:v', 'mjpeg',
            'pipe:1'
        ]
        
        process = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
        return process.stdout
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg failed to generate thumbnail from temp file: {e.stderr.decode()}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred during thumbnail generation with temp file: {e}")
        return None
    finally:
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)

def get_media_duration(media_path: str) -> Optional[float]:
    """
    Gets the duration of a media file using ffprobe.
    The media_path can be a local file path or a URL.
    For URLs, the content is streamed directly to ffprobe's stdin.
    """
    is_url = media_path.startswith('http://') or media_path.startswith('https://')

    if is_url:
        command = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            media_path
        ]
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            stdout = result.stdout
            stderr = result.stderr
            if result.returncode != 0:
                 logger.error(f"ffprobe failed for URL {media_path}: {stderr.decode()}")
                 return None
        except subprocess.CalledProcessError as e:
            logger.error(f"ffprobe failed for URL {media_path}: {e.stderr.decode()}")
            return None
    else: # It's a local file path
        command = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            media_path
        ]
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            stdout = result.stdout
            stderr = result.stderr
            if result.returncode != 0:
                 logger.error(f"ffprobe failed for local file {media_path}: {stderr.decode()}")
                 return None
        except subprocess.CalledProcessError as e:
            logger.error(f"ffprobe failed for local file {media_path}: {e.stderr.decode()}")
            return None

    try:
        metadata = json.loads(stdout)
        duration = metadata.get('format', {}).get('duration')
        
        if duration:
            return float(duration)
        
        logger.warning(f"Could not find duration in ffprobe output for {media_path}")
        return None
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Error processing ffprobe output for {media_path}: {e}")
        return None

def get_duration_from_stream(media_stream: bytes) -> Optional[float]:
    """
    Gets the duration of a media file from a stream using ffprobe.
    """
    command = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-'
    ]
    try:
        result = subprocess.run(command, input=media_stream.read(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        stdout = result.stdout
        stderr = result.stderr
        if result.returncode != 0:
             logger.error(f"ffprobe failed for stream: {stderr.decode()}")
             return None
    except subprocess.CalledProcessError as e:
        logger.error(f"ffprobe failed for stream: {e.stderr.decode()}")
        return None

    try:
        metadata = json.loads(stdout)
        duration = metadata.get('format', {}).get('duration')
        
        if duration:
            return float(duration)
        
        logger.warning(f"Could not find duration in ffprobe output for stream")
        return None
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Error processing ffprobe output for stream: {e}")
        return None
def get_video_metadata(file_path: str) -> dict:
    """
    Retrieves video metadata using ffprobe.
    """
    command = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        file_path
    ]
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        metadata = json.loads(result.stdout)
        
        video_stream = next((stream for stream in metadata['streams'] if stream['codec_type'] == 'video'), None)
        if not video_stream:
            raise ValueError("No video stream found")

        return {
            "duration": float(metadata.get('format', {}).get('duration', 0)),
            "width": int(video_stream.get('width', 0)),
            "height": int(video_stream.get('height', 0))
        }
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError, KeyError) as e:
        logger.error(f"Error getting metadata for {file_path}: {e}")
        return {}

def _get_input_path(db: Session, stream: Stream, item: dict, is_vps_stream: bool = False, public_url: Optional[str] = None) -> Union[str, None]:
    """
    Determines the correct input path for an FFmpeg input.
    For VPS streams, it generates an HTTP URL. Otherwise, it provides a local file path.
    """
    storage_type = item.get('storage_type', 'local')
    filepath = item.get('filepath')

    # Always handle GDrive streams first by pointing to the API endpoint
    # Also check if filepath indicates GDrive, even if storage_type is not set
    is_gdrive = storage_type == 'gdrive' or (filepath and 'gdrive/' in filepath)

    if is_gdrive:
        file_id = item.get('gdrive_file_id')
        if not file_id and filepath and (filepath.startswith('gdrive://') or filepath.startswith('gdrive/')):
             # Extract file_id from various gdrive path formats
             file_id = filepath.split('/')[-1]

        if file_id:
            # For VPS streams, use the public URL. For local, use the internal API service name.
            base_url = public_url if is_vps_stream and public_url else "http://api:8000"
            # Ensure the base_url does not have a trailing slash
            if base_url.endswith('/'):
                base_url = base_url[:-1]
            internal_api_key = os.getenv("INTERNAL_AGENT_ACCESS_KEY", "a-very-secret-internal-key")
            return f"{base_url}/api/v1/gdrive/stream/{file_id}?internal_api_key={internal_api_key}&user_id={stream.user_id}"
        else:
            logger.warning(f"GDrive item has no usable file ID: {item}")
            return None

    if storage_type == 'local' and filepath:
        # If it's a VPS stream, convert the local path to a public URL.
        if is_vps_stream:
            if not public_url:
                logger.error("Cannot generate media URL for VPS stream without a public_url.")
                return None
            
            media_root = "/app/media/"
            abs_filepath = os.path.abspath(filepath)

            if abs_filepath.startswith(media_root):
                relative_path = os.path.relpath(abs_filepath, media_root)
                # Ensure the base_url does not have a trailing slash
                if public_url.endswith('/'):
                    public_url = public_url[:-1]
                url = f"{public_url}/api/v1/media-files/{relative_path}"
                logger.info(f"Generated VPS media URL: {url}")
                return url
            else:
                logger.error(f"Filepath {filepath} is not in the expected media directory '{media_root}' for VPS streaming.")
                return None

        # Original logic for local execution.
        if os.path.isabs(filepath):
            return filepath
        
        # Fallback for relative paths, assuming they are relative to /app/media
        return f"/app/media/{filepath}"

    logger.warning(f"Could not determine input path for item: {item}")
    return None


def build_ffmpeg_command(stream: Stream, settings: Dict, is_thumbnail: bool = False, is_vps_stream: bool = False, public_url: Optional[str] = None) -> Tuple[list[str], Stream]:
    """
    Builds the base FFmpeg command with all inputs and filter_complex parts.
    Uses the provided settings dictionary directly.
    """
    db = SessionLocal()
    try:
        logger.info(f"--- Building base FFmpeg command for stream_id: {stream.id} (VPS: {is_vps_stream}) ---")
        if not settings or 'sources' not in settings:
            raise Exception("Stream settings or sources not found")

        write_text_filter_file(stream.id, settings)
        filter_file_path = get_filter_file_path(stream.id)

        command = ['ffmpeg', '-nostdin']
        
        filter_complex_parts = []
        audio_mappings = []
        ffmpeg_input_count = 0
        
        advanced = settings.get('advanced', {})
        output_resolution = advanced.get('resolution', '1280x720').split('x')
        output_w, output_h = int(output_resolution[0]), int(output_resolution[1])
        fps = int(advanced.get('video_fps', 30))

        aspect_ratio = settings.get('aspectRatio', '16:9')
        if aspect_ratio == '9:16':
            base_w, base_h = 720, 1280
        else:
            base_w, base_h = 1280, 720
        
        # Ensure output resolution matches aspect ratio if not explicitly set
        if f"{output_w}x{output_h}" not in [f"{base_w}x{base_h}", f"{base_h}x{base_w}"]:
            logger.warning(f"Output resolution {output_w}x{output_h} does not match aspect ratio {aspect_ratio}. Adjusting to {base_w}x{base_h}.")
            output_w, output_h = base_w, base_h
        scale_x = output_w / base_w
        scale_y = output_h / base_h
        logger.info(f"Aspect Ratio: {aspect_ratio}, Base Res: {base_w}x{base_h}, Output Res: {output_w}x{output_h}, Scale: {scale_x}, {scale_y}")
        
        filter_complex_parts.append(f"color=s={output_w}x{output_h}:c=black:r={fps}[base]")
        last_video_stream = "[base]"

        for source in settings.get('sources', []):
            source_type = source.get('type')
            logger.info(f"Processing source type: {source_type}")

            if source_type == 'video':
                for video_item in source.get('playlist', []):
                    input_path = _get_input_path(db, stream, video_item, is_vps_stream, public_url)
                    if input_path:
                        loop_option = ['-stream_loop', '-1'] if video_item.get('loop') else []
                        command.extend(loop_option + ['-i', input_path])
                        transform = video_item.get('transform', {})
                        w = int(transform.get('width', base_w) * scale_x)
                        h = int(transform.get('height', base_h) * scale_y)
                        x = int(transform.get('x', 0) * scale_x)
                        y = int(transform.get('y', 0) * scale_y)
                        
                        scaled_stream = f"[v{ffmpeg_input_count}_scaled]"
                        filter_complex_parts.append(f"[{ffmpeg_input_count}:v]scale={w}:{h},setsar=1{scaled_stream}")
                        
                        processed_stream = scaled_stream
                        chroma_key_settings = video_item.get('chromaKey', {})
                        if chroma_key_settings.get('enabled'):
                            color = chroma_key_settings.get('color', '#00ff00').replace('#', '0x')
                            similarity = chroma_key_settings.get('similarity', 0.1)
                            blend = chroma_key_settings.get('smoothness', 0.05)
                            
                            chroma_stream = f"[v{ffmpeg_input_count}_chroma]"
                            filter_complex_parts.append(f"{scaled_stream}format=rgba,chromakey=color={color}:similarity={similarity}:blend={blend},format=yuva420p{chroma_stream}")
                            processed_stream = chroma_stream

                        overlaid_stream = f"[v_overlaid_{ffmpeg_input_count}]"
                        filter_complex_parts.append(f"{last_video_stream}{processed_stream}overlay=x={x}:y={y}{overlaid_stream}")
                        last_video_stream = overlaid_stream
                        
                        mute_video_audio = advanced.get('mute_original_video', False)
                        if not video_item.get('muted', False) and not mute_video_audio:
                            audio_mappings.append(f"[{ffmpeg_input_count}:a]")
                        ffmpeg_input_count += 1

            elif source_type == 'image':
                for image_item in source.get('items', []):
                    input_path = _get_input_path(db, stream, image_item, is_vps_stream, public_url)
                    if input_path:
                        command.extend(['-loop', '1', '-r', str(fps), '-i', input_path])
                        transform = image_item.get('transform', {})
                        w = int(transform.get('width', base_w) * scale_x)
                        h = int(transform.get('height', base_h) * scale_y)
                        x = int(transform.get('x', 0) * scale_x)
                        y = int(transform.get('y', 0) * scale_y)
                        
                        scaled_stream = f"[img{ffmpeg_input_count}_scaled]"
                        filter_complex_parts.append(f"[{ffmpeg_input_count}:v]scale={w}:{h},setsar=1{scaled_stream}")
                        
                        processed_stream = scaled_stream
                        chroma_key_settings = image_item.get('chromaKey', {})
                        if chroma_key_settings.get('enabled'):
                            color = chroma_key_settings.get('color', '#00ff00').replace('#', '0x')
                            similarity = chroma_key_settings.get('similarity', 0.1)
                            blend = chroma_key_settings.get('smoothness', 0.05)
                            
                            chroma_stream = f"[img{ffmpeg_input_count}_chroma]"
                            filter_complex_parts.append(f"{scaled_stream}format=rgba,chromakey=color={color}:similarity={similarity}:blend={blend},format=yuva420p{chroma_stream}")
                            processed_stream = chroma_stream

                        overlaid_stream = f"[img_overlaid_{ffmpeg_input_count}]"
                        filter_complex_parts.append(f"{last_video_stream}{processed_stream}overlay=x={x}:y={y}{overlaid_stream}")
                        last_video_stream = overlaid_stream
                        ffmpeg_input_count += 1

            elif source_type == 'audio':
                for audio_item in source.get('audio_items', []):
                    input_path = _get_input_path(db, stream, audio_item, is_vps_stream, public_url)
                    if input_path:
                        loop_option = ['-stream_loop', '-1'] if audio_item.get('loop') else []
                        command.extend(loop_option + ['-i', input_path])
                        audio_mappings.append(f"[{ffmpeg_input_count}:a]")
                        ffmpeg_input_count += 1
            
            elif source_type == 'text':
                pass
        
        if os.path.exists(filter_file_path) and os.path.getsize(filter_file_path) > 0:
            with open(filter_file_path, "r") as f:
                text_filter_chain = f.read().strip()
            if text_filter_chain:
                text_overlaid_stream = "[text_applied]"
                filter_complex_parts.append(f"{last_video_stream}{text_filter_chain}{text_overlaid_stream}")
                last_video_stream = text_overlaid_stream

        filter_complex_parts.append(f"{last_video_stream}format=yuv420p[final_v]")

        if not is_thumbnail:
            if audio_mappings:
                if len(audio_mappings) > 1:
                    amix_inputs = "".join(audio_mappings)
                    filter_complex_parts.append(f"{amix_inputs}amix=inputs={len(audio_mappings)}[final_a]")
                else:
                    filter_complex_parts.append(f"{audio_mappings[0]}aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[final_a]")
            else:
                filter_complex_parts.append("anullsrc=channel_layout=stereo:sample_rate=44100[final_a]")

        command.extend(['-filter_complex', ";".join(filter_complex_parts)])
        return command, stream
    finally:
        db.close()


def build_ffmpeg_go_live_command(stream: Stream, settings: Dict, is_vps_stream: bool = False, public_url: Optional[str] = None) -> list[str]:
    logger.info(f"--- Building FFmpeg GO LIVE command for stream_id: {stream.id} ---")
    command, stream = build_ffmpeg_command(stream, settings, is_vps_stream=is_vps_stream, public_url=public_url)
    
    rtmp_url = None
    platform = stream.live_platform

    if platform == 'youtube' and stream.youtube_key:
        rtmp_url = f"rtmps://a.rtmp.youtube.com/live2/{stream.youtube_key}"
    elif platform == 'facebook' and stream.facebook_key:
        rtmp_url = stream.facebook_key
    elif platform == 'twitch' and stream.twitch_key:
        rtmp_url = f"rtmp://live.twitch.tv/app/{stream.twitch_key}"
    # Fallback for streams created before this change
    elif not platform:
        logger.warning(f"Stream {stream.id} has no live_platform set. Falling back to old key detection logic.")
        if stream.youtube_key:
            rtmp_url = f"rtmps://a.rtmp.youtube.com/live2/{stream.youtube_key}"
        elif stream.facebook_key:
            rtmp_url = stream.facebook_key
        elif stream.twitch_key:
            rtmp_url = f"rtmp://live.twitch.tv/app/{stream.twitch_key}"
    
    if not rtmp_url:
        raise Exception("No valid stream key found for going live.")

    advanced = settings.get('advanced', {})
    fps = int(advanced.get('video_fps', 30))
    video_bitrate = advanced.get('video_bitrate', '3000')
    audio_bitrate = advanced.get('audio_bitrate', '160')

    command.extend([
        '-copyts',
        '-map', '[final_v]', '-map', '[final_a]',
        '-c:v', 'libx264',
        '-b:v', f'{video_bitrate}k',
        '-preset', 'veryfast',
        '-maxrate', f'{video_bitrate}k',
        '-bufsize', f'{int(video_bitrate) * 2}k',
        '-pix_fmt', 'yuv420p',
        '-r', str(fps),
        '-g', str(int(fps) * 2),
        '-c:a', 'aac',
        '-b:a', f'{audio_bitrate}k',
        '-ar', '44100',
        '-f', 'flv',
        rtmp_url
    ])

    logger.info(f"Generated FFmpeg GO LIVE command: {' '.join(command)}")
    return command

def build_ffmpeg_preview_command(stream: Stream, settings: Dict, is_vps_stream: bool = False, public_url: Optional[str] = None) -> list[str]:
    logger.info(f"--- Building FFmpeg PREVIEW command for stream_id: {stream.id} ---")
    command, stream = build_ffmpeg_command(stream, settings, is_vps_stream=is_vps_stream, public_url=public_url)
    
    hls_output_dir = f"/app/media/hls/{stream.id}"
    
    if os.path.exists(hls_output_dir):
        shutil.rmtree(hls_output_dir)
    os.makedirs(hls_output_dir, exist_ok=True)

    advanced = settings.get('advanced', {})
    fps = int(advanced.get('video_fps', 30))
    video_bitrate = advanced.get('video_bitrate', '3000')
    audio_bitrate = advanced.get('audio_bitrate', '160')

    command.extend([
        '-map', '[final_v]', '-map', '[final_a]',
        '-c:v', 'libx264',
        '-b:v', f'{video_bitrate}k',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-r', str(fps),
        '-g', str(int(fps) * 2),
        '-c:a', 'aac',
        '-b:a', f'{audio_bitrate}k',
        '-ar', '44100',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments',
        f'{hls_output_dir}/stream.m3u8'
    ])

    logger.info(f"Generated FFmpeg PREVIEW command: {' '.join(command)}")
    return command

def build_ffmpeg_thumbnail_command(stream: Stream, settings: Dict, output_path: str, is_vps_stream: bool = False, public_url: Optional[str] = None) -> list[str]:
    logger.info(f"--- Building FFmpeg THUMBNAIL command for stream_id: {stream.id} ---")
    command, _ = build_ffmpeg_command(stream, settings, is_thumbnail=True, is_vps_stream=is_vps_stream, public_url=public_url)
    
    # Gunakan placeholder untuk output path jika ini adalah stream VPS, jika tidak gunakan path yang diberikan
    final_output_path = "%%OUTPUT_PATH%%" if is_vps_stream else output_path

    command.extend([
        '-map', '[final_v]',
        '-ss', '00:00:01',
        '-vframes', '1',
        '-y',
        final_output_path
    ])
    
    logger.info(f"Generated FFmpeg THUMBNAIL command: {' '.join(command)}")
    return command
