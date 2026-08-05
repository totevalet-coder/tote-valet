// Client-side helper for the AI photo-labeling feature (api/ai-label).
// Shared between Add Items and Edit Totes so both call it the same way
// instead of each maintaining their own copy of this logic.

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Returns detected item labels for a photo, or [] if detection fails or finds
 * nothing. AI labeling is a convenience feature — callers should treat a
 * failure as non-fatal and just fall back to manual entry, not surface an error.
 */
export async function detectItemsFromPhoto(file: File): Promise<string[]> {
  try {
    const imageBase64 = await fileToBase64(file)
    const res = await fetch('/api/ai-label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType: file.type }),
    })
    const data = await res.json()
    if (res.ok && Array.isArray(data.items)) return data.items
    return []
  } catch {
    return []
  }
}
