function basename(value) {
  if (!value) return null
  const cleaned = String(value).split('?')[0].split('#')[0]
  const parts = cleaned.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : null
}

export function avatarUrlFromValue(value) {
  const name = basename(value)
  return name ? `/api/uploads/avatars/${encodeURIComponent(name)}` : null
}

export function fileUrlFromValue(value) {
  const name = basename(value)
  return name ? `/api/uploads/files/${encodeURIComponent(name)}` : null
}
