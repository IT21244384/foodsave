const TOKEN_KEY = 'foodsave.token';

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(token) { try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } },
};

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || 'Something went wrong. Please try again.');
    this.status = status;
    this.fields = (body && body.fields) || {};
  }
}

async function send(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  try {
    return { res: await fetch(`/api${path}`, { method, headers, body: payload }), token };
  } catch {
    throw new ApiError(0, { error: 'Cannot reach the FoodSave server. Check your connection and try again.' });
  }
}

export async function api(path, options) {
  const { res, token } = await send(path, options);
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('foodsave:unauthorized'));
    throw new ApiError(res.status, data);
  }
  return data;
}

// Opens a protected file (e.g. a charity certificate) in a new tab using the signed-in token.
export async function openProtectedFile(path) {
  const { res } = await send(path);
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();
