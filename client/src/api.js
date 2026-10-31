// Thin fetch wrapper for the REST API. The JWT lives in localStorage.
const TOKEN_KEY = 'ng_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
};

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(path, opts = {}) {
  // Reads are retried for a few seconds when the server is briefly unavailable (e.g. restarting).
  const retries = (opts.method || 'GET') === 'GET' ? 3 : 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(path, opts);
    } catch (e) {
      if (attempt >= retries || !(e.status === 0 || e.status === 502 || e.status === 503)) throw e;
      await wait(800 * (attempt + 1));
    }
  }
}

async function request(path, { method = 'GET', body, form, onProgress } = {}) {
  if (form && onProgress) return xhrUpload(path, method, form, onProgress);
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form; // FormData — browser sets the multipart boundary
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Please check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) setToken(null);
    throw new ApiError(res.status, data.error || (res.status >= 500 ? 'The server could not complete this request. Please try again.' : `Request failed (${res.status})`), data);
  }
  return data;
}

/** Multipart upload through XMLHttpRequest, the only browser API that reports upload progress (0–1). */
function xhrUpload(path, method, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, '/api' + path);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Please check your connection.'));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      if (xhr.status === 401 && token) setToken(null);
      reject(new ApiError(xhr.status, data.error || (xhr.status === 413 ? 'The file is too large (100 MB maximum).' : `Upload failed (${xhr.status})`), data));
    };
    xhr.send(form);
  });
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

export const qs = (o) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return s ? '?' + s : '';
};
