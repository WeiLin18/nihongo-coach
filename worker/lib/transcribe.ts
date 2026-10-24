import OpenAI from 'openai'

export async function transcribe(apiKey: string, audio: File): Promise<string> {
  const client = new OpenAI({ apiKey })
  const result = await client.audio.transcriptions.create({
    model: 'gpt-4o-transcribe',
    file: audio,
    // Input is Japanese or Chinese; this nudges toward Traditional characters for Chinese.
    prompt: '日本語、または台湾の繁體中文。',
  })
  return result.text
}
