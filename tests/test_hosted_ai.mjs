import assert from 'node:assert/strict';
import test from 'node:test';
import explain from '../netlify/functions/flame-ai.mjs';

const url = 'https://flame-ai.example.test/flame-ai';
const origin = 'https://shanxiaohu123.github.io';
const questions = {
  en: 'What do the 284 tests in the FLEX report represent?',
  zh: 'FLEX 报告的 284 次试验代表什么？',
};
function request(method, body, sender = origin) {
  return new Request(url, {
    method,
    headers: {Origin: sender, 'Content-Type': 'application/json'},
    body: body && JSON.stringify(body),
  });
}

test('hosted DeepSeek uses the authorized origin, language, and valid evidence IDs', async t => {
  let key;
  t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected upstream call'));
  globalThis.Netlify = {env: {get: () => key}};
  t.after(() => { delete globalThis.Netlify; });

  const denied = await explain(request('POST', {question: questions.en, language: 'en'}, 'https://other.example'));
  assert.equal(denied.status, 403);
  const preflight = await explain(request('OPTIONS'));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual(await (await explain(request('GET'))).json(), {live_enabled: false, provider: 'deepseek'});
  assert.equal((await explain(request('POST', {question: questions.en, language: 'en'}))).status, 503);

  key = 'test-key';
  assert.equal((await (await explain(request('GET'))).json()).live_enabled, true);
  const guarded = await explain(request('POST', {question: 'Safe oxygen for a Moon base?', language: 'en'}));
  assert.equal((await guarded.json()).mode, 'guard');
  assert.equal((await explain(request('POST', {question: 123, language: 'en'}))).status, 400);
  assert.equal((await explain(request('POST', {question: 'a'.repeat(1201), language: 'en'}))).status, 400);

  for (const [language, question] of Object.entries(questions)) {
    let invalid = false;
    fetch.mock.mockImplementation(async (upstream, {body, headers}) => {
      assert.equal(upstream, 'https://api.deepseek.com/chat/completions');
      assert.equal(headers.Authorization, 'Bearer test-key');
      const payload = JSON.parse(body);
      assert.equal(payload.model, 'deepseek-flash');
      const context = JSON.parse(payload.messages[1].content);
      assert.match(payload.messages[0].content, language === 'en'?/Answer in English/:/Answer in Chinese/);
      assert.equal(context.question, question);
      assert.equal(context.evidence[0].id, 'F02');
      assert.match(context.evidence[0].text, language === 'en'?/first 284/:/前 284/);
      const out = {
        status: 'supported',
        claims: [{text: 'Answer', evidence_ids: [invalid?'invented':'F02']}],
        limitations: ['Abstract-level evidence'],
      };
      return Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify(out)}}]});
    });
    const response = await explain(request('POST', {question, language}));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mode, 'live');
    invalid = true;
    assert.equal((await explain(request('POST', {question, language}))).status, 502);
  }
});
