const KEY = 'adminViewAs'

export type ViewAsRole = 'driver' | 'warehouse' | 'sorter' | 'customer'

export function getViewAsRole(): ViewAsRole | null {
  if (typeof window === 'undefined') return null
  return (sessionStorage.getItem(KEY) as ViewAsRole) || null
}

export function setViewAsRole(role: ViewAsRole) {
  sessionStorage.setItem(KEY, role)
}

export function clearViewAsRole() {
  sessionStorage.removeItem(KEY)
}
