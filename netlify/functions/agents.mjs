// GG · AI Agents
// POST /gg-agents { agent, prompt, history, os?, device?, custom? } -> text/event-stream
// Events: {type:'step',text} {type:'text',delta} {type:'source',title,url} {type:'done'} {type:'error',error}
import Anthropic from '@anthropic-ai/sdk'
import { validateAgentRequest, buildAgentCall } from '../../agents-core.js'

export const MODEL = 'claude-sonnet-4-6'
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export function safeSource(title, address) {
  try {
    const u = new URL(address)
    if (u.protocol !== 'https:' || u.username || u.password) return null
    return { title: String(title || u.hostname).slice(0, 200), url: u.href }
  } catch { return null }
}

// Runs the agent and reports progress through emit(). Exported for tests with a fake client.
export async function runAgent(req, emit, client = new Anthropic()) {
  const { system, messages, searches } = buildAgentCall(req)
  const tools = searches ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: searches }] : undefined
  const seen = new Set()
  const addSource = (title, url) => {
    const s = safeSource(title, url)
    if (s && !seen.has(s.url) && seen.size < 20) { seen.add(s.url); emit({ type: 'source', ...s }) }
  }
  emit({ type: 'step', text: searches ? 'Planning the task and deciding what to look up…' : 'Thinking about your request…' })
  const convo = [...messages]
  for (let round = 0; round < 3; round++) {
    const stream = client.messages.stream({ model: MODEL, max_tokens: 6000, system, messages: convo, ...(tools ? { tools } : {}) }, { timeout: 120000, maxRetries: 0 })
    stream.on('text', delta => emit({ type: 'text', delta }))
    stream.on('contentBlock', block => {
      if (block.type === 'server_tool_use' && block.name === 'web_search' && block.input?.query) emit({ type: 'step', text: `Searching the web: “${String(block.input.query).slice(0, 160)}”` })
      if (block.type === 'web_search_tool_result') {
        if (Array.isArray(block.content)) {
          const hits = block.content.filter(i => i.type === 'web_search_result')
          emit({ type: 'step', text: `Reading ${hits.length} result${hits.length === 1 ? '' : 's'}` })
          hits.slice(0, 4).forEach(i => addSource(i.title, i.url))
        } else emit({ type: 'step', text: 'A web search failed, continuing with what I have' })
      }
      if (block.type === 'text') for (const c of block.citations || []) if (c.type === 'web_search_result_location') addSource(c.title, c.url)
    })
    const final = await stream.finalMessage()
    if (final.stop_reason !== 'pause_turn') break
    convo.push({ role: 'assistant', content: final.content })
    emit({ type: 'step', text: 'Continuing the research…' })
  }
  emit({ type: 'done' })
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let body
  try { body = validateAgentRequest(await req.json()) } catch (e) { return json({ error: e instanceof SyntaxError ? 'Invalid request.' : e.message }, 400) }
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let open = true
      const emit = ev => { if (open) try { controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`)) } catch { open = false } }
      try { await runAgent(body, emit) }
      catch (e) { emit({ type: 'error', error: e?.status === 429 ? 'The agents are busy right now. Try again in a moment.' : 'The agent could not finish this task. Please try again.' }) }
      finally { open = false; try { controller.close() } catch {} }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
}

export const config = { path: '/gg-agents' }
