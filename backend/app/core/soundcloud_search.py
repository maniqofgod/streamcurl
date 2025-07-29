import yt_dlp
import logging
import os
import mimetypes

logger = logging.getLogger(__name__)

class SoundCloudSearch:
    def __init__(self):
        pass

    def search(self, query: str, limit: int = 10, page: int = 1):
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'default_search': f'scsearch{limit * page}',
            'noplaylist': True,
        }
        
        logger.info(f"Searching for {limit} tracks on SoundCloud with query: '{query}' (page {page})")
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                result = ydl.extract_info(query, download=False)
                
                entries = result.get('entries', [])
                
                start_index = (page - 1) * limit
                end_index = start_index + limit
                videos = entries[start_index:end_index]

                logger.info(f"Found and processed {len(videos)} tracks.")
                
                tracks = []
                for track_data in videos:
                    if track_data:
                        tracks.append({
                            'id': track_data.get('id'),
                            'title': track_data.get('title', 'No Title'),
                            'uploader': track_data.get('uploader', 'Unknown Artist'),
                            'duration': track_data.get('duration'),
                            'webpage_url': track_data.get('webpage_url'),
                            'artwork_url': track_data.get('thumbnail'),
                            'filesize_approx': track_data.get('filesize_approx')
                        })
                return tracks

        except Exception as e:
            logger.error(f"Error searching SoundCloud: {e}", exc_info=True)
            return []

    def download(self, url: str, out_dir: str):
        """
        Downloads a track from a SoundCloud URL to the specified directory,
        avoiding post-processing.
        Returns a dict with path, filename, and mimetype.
        """
        ydl_opts = {
            'format': 'bestaudio/best',
            # Define the output template for the final MP3 file
            'outtmpl': os.path.join(out_dir, '%(title)s.mp3'),
            'quiet': True,
            'noplaylist': True,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',  # Bitrate in kbps
            }],
        }
        
        try:
            logger.info(f"Starting download for {url} into directory {out_dir}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            
            # After post-processing, yt-dlp should leave only the final .mp3 file.
            # We'll find it to ensure we're uploading the correct file.
            downloaded_files = os.listdir(out_dir)
            
            mp3_files = [f for f in downloaded_files if f.endswith('.mp3')]
            
            if not mp3_files:
                raise Exception("yt-dlp finished, but the expected .mp3 file was not found.")

            filename = mp3_files[0]
            filepath = os.path.join(out_dir, filename)
            # Explicitly set mimetype for mp3, as guess_type can be unreliable.
            mimetype = "audio/mpeg"
            
            logger.info(f"Finished download for {url}. File: {filepath}")
            
            return {
                "path": filepath,
                "filename": filename,
                "mimetype": mimetype or 'application/octet-stream'
            }
        except Exception as e:
            logger.error(f"Error downloading from SoundCloud: {e}", exc_info=True)
            raise e
