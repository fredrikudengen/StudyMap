export const API_BASE = import.meta.env.VITE_API_URL ?? ''

export const getToken = () => localStorage.getItem('token')
export const setToken = (t) => localStorage.setItem('token', t)
export const clearToken = () => localStorage.removeItem('token')

export function authFetch(url, options = {}) {
  const token = getToken()
  return fetch(API_BASE + url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
