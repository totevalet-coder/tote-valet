import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { imageBase64, mimeType } = await request.json()

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const safeMimeType = validMimeTypes.includes(mimeType) ? mimeType : 'image/jpeg'

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: safeMimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `You are a storage inventory assistant for Tote Valet, a tote storage service.

Look at this photo of items that need to be stored in a tote.
Identify each distinct item or category of items visible in the image.
Return a JSON array of short, descriptive item labels.

Rules:
- Each label should be concise (2-5 words max)
- Be specific but not overly detailed
- Group similar items when reasonable (e.g., "Winter Clothing" rather than listing each piece)
- Return only a valid JSON array of strings, nothing else
- Maximum 15 items

Example response: ["Winter jacket", "Black boots", "Ski helmet", "Christmas ornaments", "Photo albums"]

Now analyze the image and return the item labels:`,
            },
          ],
        },
      ],
    })

    // Parse the response
    const content = message.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from AI')
    }

    let items: string[] = []
    try {
      // Extract JSON array from response (handle any surrounding text)
      const match = content.text.match(/\[[\s\S]*\]/)
      if (match) {
        items = JSON.parse(match[0])
      } else {
        // Fall back to splitting by newlines/commas
        items = content.text
          .split(/[\n,]/)
          .map((s: string) => s.replace(/^[-•*\d.)\s"]+|["]+$/g, '').trim())
          .filter((s: string) => s.length > 0)
      }
    } catch {
      // If parsing fails, return the raw text split by newlines
      items = content.text
        .split('\n')
        .map((s: string) => s.replace(/^[-•*\d.)\s"]+|["]+$/g, '').trim())
        .filter((s: string) => s.length > 0)
    }

    return NextResponse.json({ items: items.slice(0, 15) })
  } catch (error: unknown) {
    console.error('AI labeling error:', error)
    const message = error instanceof Error ? error.message : 'AI labeling failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
