import * as ort from './vendor/ort/ort.wasm.min.mjs';
import { createTokenizer } from './model-tokenizer.mjs';

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('./vendor/ort/', import.meta.url).href;
let session, tokenizer, manifest;
let queue = Promise.resolve();
const post = (id, type, values) => self.postMessage({ id, type, ...values });
async function digest(buffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
}
async function load(id) {
  if (session) return;
  post(id, 'progress', { message: 'Loading the trained MiniLM model…' });
  const response = await fetch(new URL('./model/manifest.json', import.meta.url));
  if (!response.ok) throw new Error('Model manifest is unavailable');
  manifest = await response.json();
  const modelUrl = new URL('./model/' + manifest.file, import.meta.url).href;
  let cache;
  try { cache = await caches.open('medorchestrate-model-' + manifest.version); } catch { /* Private browsing may deny caching. */ }
  let bytes, cached = cache && await cache.match(modelUrl);
  if (cached) {
    bytes = await cached.arrayBuffer();
    if (await digest(bytes) !== manifest.sha256) { await cache.delete(modelUrl); bytes = null; }
  }
  if (!bytes) {
    post(id, 'progress', { message: `Downloading ${(manifest.size_bytes / 1048576).toFixed(1)} MB model; saved on this device when caching is available…` });
    const model = await fetch(modelUrl);
    if (!model.ok) throw new Error('Trained model download failed');
    bytes = await model.arrayBuffer();
    if (await digest(bytes) !== manifest.sha256) throw new Error('Trained model integrity check failed');
    if (cache) { try { await cache.put(modelUrl, new Response(bytes)); } catch { /* Search works when storage is full. */ } }
  }
  const vocabResponse = await fetch(new URL('./model/vocab.txt', import.meta.url));
  if (!vocabResponse.ok) throw new Error('Model tokenizer is unavailable');
  const vocabBytes = await vocabResponse.arrayBuffer();
  if (await digest(vocabBytes) !== manifest.vocab_sha256) throw new Error('Tokenizer integrity check failed');
  tokenizer = createTokenizer(new TextDecoder().decode(vocabBytes), manifest.max_length);
  post(id, 'progress', { message: 'Starting model inference on your device…' });
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}
async function process(message) {
  const { id, type, texts } = message;
  try {
    if (type !== 'encode' && type !== 'init') throw new Error('Unknown model operation');
    await load(id);
    if (type === 'init') return post(id, 'result', { model: manifest, embeddings: [] });
    if (!Array.isArray(texts) || !texts.length || texts.length > 48 || texts.some(t => typeof t !== 'string' || t.length > 30000)) throw new Error('Invalid model text batch');
    const embeddings = [];
    for (let start = 0; start < texts.length; start += 4) {
      post(id, 'progress', { message: `Encoding ${Math.min(start + 4, texts.length)} of ${texts.length} texts with trained MiniLM…` });
      const batch = tokenizer.batch(texts.slice(start, start + 4));
      const feeds = Object.fromEntries(['input_ids', 'attention_mask', 'token_type_ids'].map(name => [name, new ort.Tensor('int64', batch[name], batch.dims)]));
      const output = await session.run(feeds);
      for (let i = 0; i < batch.dims[0]; i++) embeddings.push(Array.from(output.embeddings.data.slice(i * manifest.dimensions, (i + 1) * manifest.dimensions)));
      for (const tensor of Object.values(feeds)) tensor.dispose();
      for (const tensor of Object.values(output)) tensor.dispose();
    }
    post(id, 'result', { embeddings, model: manifest });
  } catch (error) { post(id, 'error', { error: error.message || String(error) }); }
}
self.onmessage = event => { queue = queue.then(() => process(event.data)).catch(error => post(event.data?.id, 'error', { error: String(error) })); };
