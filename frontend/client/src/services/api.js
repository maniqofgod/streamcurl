import axios from 'axios';

const api = axios.create({
  withCredentials: true,
});

const getCookie = (name) => {
  const cookies = document.cookie.split('; ');
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) {
      return value;
    }
  }
  return null;
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method.toUpperCase())) {
      const csrfToken = getCookie('csrf_token');
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const login = async (username, password) => {
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  const response = await api.post('/api/v1/auth/token', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (response.data.access_token) {
    localStorage.setItem('access_token', response.data.access_token);
  }
  return response.data;
};

export const register = async (username, password) => {
  const response = await api.post('/api/v1/auth/users/', { username, password });
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get('/api/v1/auth/users/me');
  return response.data;
};

export const changePassword = async (currentPassword, newPassword) => {
    const response = await api.put('/api/v1/auth/users/me/password', { 
        current_password: currentPassword, 
        new_password: newPassword 
    });
    return response.data;
};

export const uploadProfilePicture = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.put('/api/v1/auth/users/me/profile-picture', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const getStreams = async () => {
    const response = await api.get('/api/v1/streams/');
    return response.data;
};

export const getStream = async (streamId) => {
    const response = await api.get(`/api/v1/streams/${streamId}`);
    return response.data;
};
export const getStreamStatus = async (streamId) => {
    const response = await api.get(`/api/v1/streams/${streamId}/status`);
    return response.data;
};

export const startStreamPreview = async (streamId) => {
    const response = await api.post(`/api/v1/streams/${streamId}/preview`);
    return response.data;
};

export const goLiveStream = async (streamId) => {
    const response = await api.post(`/api/v1/streams/${streamId}/go-live`);
    return response.data;
};

export const stopStream = async (streamId) => {
    const response = await api.post(`/api/v1/streams/${streamId}/stop`);
    return response.data;
};

export const deleteStream = async (streamId) => {
    const response = await api.delete(`/api/v1/streams/${streamId}`);
    return response.data;
};

export const createStream = async (streamData) => {
    const response = await api.post('/api/v1/streams/', streamData);
    return response.data;
};

export const updateStream = async (streamId, streamData) => {
    const response = await api.put(`/api/v1/streams/${streamId}`, streamData);
    return response.data;
};

export const linkYoutube = async (streamId, payload) => {
    const response = await api.post(`/api/v1/streams/${streamId}/link_youtube`, payload);
    return response.data;
};

// Video specific functions
export const getVideos = async () => {
    const response = await api.get('/api/v1/videos/');
    return response.data;
};

export const deleteVideo = async (videoId) => {
    const response = await api.delete(`/api/v1/videos/${videoId}`);
    return response.data;
};

export const deleteVideos = async (videoIds) => {
    const response = await api.delete('/api/v1/videos/', { data: { video_ids: videoIds } });
    return response.data;
};

export const renameVideo = async (videoId, newName) => {
    const formData = new FormData();
    formData.append('new_name', newName);
    const response = await api.put(`/api/v1/videos/${videoId}/rename`, formData);
    return response.data;
};

// Admin functions
export const uploadClientSecret = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/v1/admin/upload_client_secret', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const getClientSecrets = async () => {
    const response = await api.get('/api/v1/admin/client_secrets');
    return response.data;
};

export const deleteClientSecret = async (secretName) => {
    const response = await api.delete(`/api/v1/admin/client_secrets/${secretName}`);
    return response.data;
};

export const createUser = async (userData) => {
    const response = await api.post('/api/v1/admin/users/', userData);
    return response.data;
};

export const readUsers = async () => {
    const response = await api.get('/api/v1/admin/users/');
    return response.data;
};

export const updateUserRole = async (userId, role) => {
    const response = await api.put(`/api/v1/admin/users/${userId}/role`, { role });
    return response.data;
};

export const updateUser = async (userId, userData) => {
    const response = await api.put(`/api/v1/admin/users/${userId}`, userData);
    return response.data;
};

export const approveUser = async (userId) => {
    const response = await api.put(`/api/v1/admin/users/${userId}/approve`);
    return response.data;
};

export const updateUserPassword = async (userId, password) => {
    const response = await api.put(`/api/v1/admin/users/${userId}/password`, { password });
    return response.data;
};
export const deleteUser = async (userId) => {
    const response = await api.delete(`/api/v1/admin/users/${userId}`);
    return response.data;
};

export const adminCreateVpsForUser = async (userId, vpsData) => {
    const response = await api.post(`/api/v1/admin/users/${userId}/vps/`, vpsData);
    return response.data;
};

export const adminDeleteVps = async (vpsId) => {
    const response = await api.delete(`/api/v1/admin/vps/${vpsId}`);
    return response.data;
};

export const adminReadVpsList = async () => {
    const response = await api.get('/api/v1/admin/vps/');
    return response.data;
};

// Audio functions
export const getAudios = async () => {
    const response = await api.get('/api/v1/audios/');
    return response.data;
};

export const uploadAudio = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/v1/audios/', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const deleteAudio = async (audioId) => {
    const response = await api.delete(`/api/v1/audios/${audioId}`);
    return response.data;
};

export const renameAudio = async (audioId, newName) => {
    const formData = new FormData();
    formData.append('new_name', newName);
    const response = await api.put(`/api/v1/audios/${audioId}/rename`, formData);
    return response.data;
};

// Dashboard functions
export const getDashboardData = async (vpsId) => {
    const params = {};
    if (vpsId) {
        params.vps_id = vpsId;
    }
    const response = await api.get('/api/v1/dashboard/data', { params });
    return response.data;
};

// Image functions
export const getImages = async () => {
    const response = await api.get('/api/v1/images/');
    return response.data;
};

// Media functions
export const getMedia = async () => {
    const response = await api.get('/api/v1/media/all');
    return response.data;
};

export const getUserContext = async () => {
    const response = await api.get('/api/v1/gdrive/user-context');
    return response.data;
};

// Google Drive Functions
export const getGoogleDriveFiles = async (fileType, userId) => {
    let url = `/api/v1/gdrive/files/${fileType || 'all'}`;
    const params = {};
    if (userId) {
        params.user_id = userId;
    }
    const response = await api.get(url, { params });
    return response.data;
};

export const deleteGoogleDriveFile = async (fileId, userId) => {
    const params = {};
    if (userId) {
        params.user_id = userId;
    }
    const response = await api.delete(`/api/v1/gdrive/files/${fileId}`, { params });
    return response.data;
};

export const adminGetUsersGdriveInfo = async () => {
    const response = await api.get('/api/v1/gdrive/admin/users');
    return response.data;
};

export const adminUploadToUserDrive = async (userId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/api/v1/gdrive/admin/upload/${userId}`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const uploadToMyGoogleDrive = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/v1/gdrive/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

// Overlay functions
export const searchPixabay = async (query, page = 1) => {
    const response = await api.get(`/api/v1/overlays/search_pixabay?q=${query}&page=${page}`);
    return response.data;
};

export const downloadPixabayImage = async (url) => {
    const response = await api.post('/api/v1/overlays/download_pixabay', { url });
    return response.data;
};

export const uploadOverlay = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/v1/overlays/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const readOverlays = async () => {
    const response = await api.get('/api/v1/overlays/');
    return response.data;
};

// SoundCloud functions
export const searchSoundcloud = async (query, limit = 10, page = 1) => {
    const response = await api.get(`/api/v1/soundcloud/search?q=${query}&limit=${limit}&page=${page}`);
    return response.data;
};

export const downloadSoundcloudTrack = async (trackData) => {
    const response = await api.post('/api/v1/soundcloud/download', trackData);
    return response.data;
};

// VPS functions
export const createVps = async (vpsData) => {
    const response = await api.post('/api/v1/vps/', vpsData);
    return response.data;
};

export const readVpsList = async () => {
    const response = await api.get('/api/v1/vps/');
    return response.data;
};

export const readVps = async (vpsId) => {
    const response = await api.get(`/api/v1/vps/${vpsId}`);
    return response.data;
};

export const updateVps = async (vpsId, vpsData) => {
    const response = await api.put(`/api/v1/vps/${vpsId}`, vpsData);
    return response.data;
};

export const deleteVps = async (vpsId) => {
    const response = await api.delete(`/api/v1/vps/${vpsId}`);
    return response.data;
};

// YouTube functions
export const getYouTubeStats = async (streamId) => {
    const response = await api.get(`/api/v1/youtube/stats/${streamId}`);
    return response.data;
};

export const loginForYoutube = async () => {
    const response = await api.get('/api/v1/youtube/login');
    return response.data;
};

export const deleteYoutubeCredentials = async () => {
    const response = await api.delete('/api/v1/youtube/credentials');
    return response.data;
};

export const getLiveBroadcasts = async () => {
    const response = await api.get('/api/v1/youtube/live_broadcasts');
    return response.data;
};

export const previewStream = (streamId) => {
    return api.post(`/api/v1/streams/${streamId}/preview`);
};

export const getApiSettings = async () => {
    const response = await api.get('/api/v1/admin/settings');
    return response.data;
};

export const updateApiSettings = async (settings) => {
    const response = await api.put('/api/v1/admin/settings', settings);
    return response.data;
};

export const checkApiKey = async (api_type, api_key) => {
    const response = await api.post('/api/v1/admin/check_api_key', { api_type, api_key });
    return response.data;
};


export default api;
export const renameGoogleDriveFile = async (fileId, newName, userId) => {
    const params = {};
    if (userId) {
        params.user_id = userId;
    }
    const response = await api.patch(`/api/v1/gdrive/files/${fileId}`, { new_name: newName }, { params });
    return response.data;
};
