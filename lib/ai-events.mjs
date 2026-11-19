// A small SSE envelope shared by both chat providers. Final data includes normalized citations.
export function streamAIResult(work, { interval = 4000 } = {}) {
  const encoder = new TextEncoder(), cancelled = new AbortController();
  let timer, closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = event => {
        if (!closed) controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'));
      };
      send({ type: 'start' });
      timer = setInterval(() => send({ type: 'heartbeat' }), interval);
      try {
        const data = await work(text => send({ type: 'delta', text }), cancelled.signal);
        send({ type: 'result', data });
      } catch (error) {
        send({ type: 'error', error: error?.status === 429 ? 'The assistant is busy. Try again shortly.' : 'The answer could not be completed. Please retry.' });
      } finally {
        clearInterval(timer);
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; clearInterval(timer); cancelled.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
