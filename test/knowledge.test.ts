import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DELEGATE_LOCAL = mkdtempSync(join(tmpdir(), 'delegate-klocal-'))
const { Store } = await import('../src/store/state.ts')
const { FilesKnowledge } = await import('../src/knowledge/index.ts')
const { parseLine, formatLine, editCard } = await import('../src/knowledge/format.ts')
const { propose, answerProposal, remember, changeKnowledge, resolveEvidence, inbox } = await import('../src/runner/proposals.ts')

const OWNER = { id: 'me', name: 'Robin Park' }
const today = new Date().toISOString().slice(0, 10)
const old = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10)
const GROUP = 'https://teams.microsoft.com/l/message/19:abc@thread.v2/1792000000001'
const ONE_ON_ONE = 'https://teams.microsoft.com/l/message/19:a_b@unq.gbl.spaces/1792000000002'

function setup() {
	const root = mkdtempSync(join(tmpdir(), 'delegate-kroot-'))
	const store = new Store({ root, machine: 'mac' })
	store.saveConfig({ schema: 1, owner: OWNER, source: { command: [], selfChatId: 'self' }, watch: [], agent: { flavor: 'copilot', command: [], tools: [] }, maxParallel: 1, nudgeEveryMin: 30 })
	return { store, k: new FilesKnowledge(join(root, 'knowledge'), 'mac') }
}
const ok = (code: string, seenAt = new Date(Date.now() + 1000).toISOString()) => ({ id: '', code, verb: 'ok' as const, surface: 'chat' as const, at: '', seenAt })

test('R-KNO-01 an entry line keeps its type, id, tags, sources, and review date through a round trip', () => {
	const line = `- [decision] Ship to ring 1 first. ^b7k2 #rollout (src: ${GROUP}, 2026-10-12, Vikram) (review: 2026-11-01)`
	const e = parseLine(line, { topic: 'banner-fix', card: 'decisions', audience: 'team' })!
	assert.deepEqual([e.type, e.id, e.text, e.tags, e.src[0].who, e.review], ['decision', 'b7k2', 'Ship to ring 1 first.', ['rollout'], 'Vikram', '2026-11-01'])
	assert.equal(formatLine(e), line.replace(GROUP, GROUP.replace(/,/g, '%2C')))
})

test('R-KNO-03 editing a card keeps the owner\'s own notes untouched', () => {
	const text = '---\ntopic: t\n---\nMy own notes.\n\n## Observations\n- [fact] A. ^a1\n\n## Links\n- [[other]]\n'
	const out = editCard(text, 'add', '- [fact] B. ^b2')
	assert.equal(out, '---\ntopic: t\n---\nMy own notes.\n\n## Observations\n- [fact] A. ^a1\n- [fact] B. ^b2\n\n## Links\n- [[other]]\n')
	assert.equal(editCard(out, 'retire', '', 'a1').includes('^a1'), false)
})

test('R-BOOT-06 nothing is saved until ok; ok saves exactly the proposal and writes the index', () => {
	const { store, k } = setup()
	const [p] = propose(store, k, [{ topic: 'Banner fix', type: 'decision', text: 'Ship to ring 1 first.', src: [{ link: GROUP, date: today, who: 'Vikram' }] }], 'bootstrap', 'your chats')
	assert.equal(p.code, 'K1'); assert.equal(k.topics().length, 0)
	assert.match(answerProposal(store, k, p, ok('K1')), /Saved K1: 1 entry in Banner fix\. Say "undo K1"/)
	const [hit] = k.search('banner ring')
	assert.equal(hit.text, 'Ship to ring 1 first.'); assert.equal(hit.audience, 'team'); assert.equal(hit.src[0].link, GROUP)
	assert.match(readFileSync(join(k.root, 'index.md'), 'utf8'), /- \[\[banner-fix\]\] Banner fix · 1 entry/)
})

test('R-BOOT-06 skip writes nothing, and a stale ok is refused with the current content', () => {
	const { store, k } = setup()
	const [p] = propose(store, k, [{ topic: 'Banner fix', type: 'fact', text: 'Flag is enableBanner.', src: [{ link: GROUP, date: today }] }], 'bootstrap')
	assert.match(answerProposal(store, k, p, ok('K1', new Date(Date.now() - 60_000).toISOString())), /K1 changed after your ok/)
	assert.match(answerProposal(store, k, p, { ...ok('K1'), verb: 'skip' }), /Dropped K1\. Nothing was saved/)
	assert.equal(k.topics().length, 0)
})

test('R-BOOT-07 a claim from a 1:1 chat is private; a group chat claim is team', () => {
	const { store, k } = setup()
	const [p] = propose(store, k, [
		{ topic: 'Hiring', type: 'open', text: 'Waiting on the offer approval.', src: [{ link: ONE_ON_ONE, date: today }] },
		{ topic: 'Hiring', type: 'fact', text: 'Loop has four interviews.', src: [{ link: GROUP, date: today }] },
	], 'bootstrap')
	assert.deepEqual(p.ops.map(o => o.entry.audience), ['private', 'team'])
})

test('dev-spec 05 a claim whose source is already known updates that entry instead of adding one', () => {
	const { store, k } = setup()
	const [p] = propose(store, k, [{ topic: 'Banner fix', type: 'status', text: 'In ring 0.', src: [{ link: GROUP, date: today }] }], 'bootstrap')
	answerProposal(store, k, p, ok('K1'))
	const [q] = propose(store, k, [{ topic: 'Banner fix', type: 'status', text: 'In ring 1.', src: [{ link: GROUP, date: today }] }], 'bootstrap')
	assert.equal(q.ops[0].op, 'update'); assert.equal(q.ops[0].id, k.search('ring')[0].id)
	answerProposal(store, k, q, ok('K2'))
	assert.deepEqual(k.search('ring').map(h => h.text), ['In ring 1.'])
})

test('R-BOOT-05 a card changed after the proposal refreshes it instead of overwriting', () => {
	const { store, k } = setup()
	const [a] = propose(store, k, [{ topic: 'Banner fix', type: 'fact', text: 'Flag is enableBanner.', src: [{ link: GROUP, date: today }] }], 'bootstrap')
	answerProposal(store, k, a, ok('K1'))
	const [b] = propose(store, k, [{ topic: 'Banner fix', type: 'fact', text: 'Code is in banner.tsx.', src: [{ link: GROUP + '9', date: today }] }], 'bootstrap')
	const card = join(k.root, 'topics', 'banner-fix', 'architecture.md')
	writeFileSync(card, readFileSync(card, 'utf8') + '\nOwner edit.\n')
	assert.match(answerProposal(store, k, b, ok('K2')), /Banner fix changed since K2\. Review K3 instead/)
	assert.match(readFileSync(card, 'utf8'), /Owner edit\./)
})

test('dev-spec 05 remember saves at once, and undo takes it back', () => {
	const { store, k } = setup()
	assert.match(remember(store, k, OWNER.name, { topic: 'Banner fix', type: 'decision', text: 'Ring 3 after one clean week.' }), /Saved K1: 1 entry in Banner fix\. Say "undo K1"/)
	assert.equal(k.search('ring clean')[0].audience, 'private')
	assert.match(answerProposal(store, k, store.proposal('K1')!, { ...ok('K1'), verb: 'undo' }), /Took back K1: 1 fact in Banner fix is back as before\./)
	assert.equal(k.search('ring clean').length, 0)
})

test('B29 the owner corrects or forgets a fact in plain words: saved at once, undo brings it back', () => {
	const { store, k } = setup()
	remember(store, k, OWNER.name, { topic: 'Banner fix', type: 'decision', text: 'Ring 3 after one clean week.' })
	const ref = `card:${k.search('ring clean')[0].topic}/${k.search('ring clean')[0].card}#${k.search('ring clean')[0].id}`
	assert.match(changeKnowledge(store, k, OWNER.name, { ref, text: 'Ring 3 after two clean weeks.' }), /^Saved K2: 1 entry in Banner fix\. Say "undo K2"/)
	assert.deepEqual(k.search('ring clean').map(h => h.text), ['Ring 3 after two clean weeks.'])
	answerProposal(store, k, store.proposal('K2')!, { ...ok('K2'), verb: 'undo' })
	assert.deepEqual(k.search('ring clean').map(h => h.text), ['Ring 3 after one clean week.'], 'undo restores the old fact')
	assert.match(changeKnowledge(store, k, OWNER.name, { ref }), /^Saved K3: 1 entry in Banner fix/)
	assert.equal(k.search('clean week').length, 0, 'forgotten')
	assert.match(changeKnowledge(store, k, OWNER.name, { ref: 'card:nope/faq#x' }), /^I could not find card:nope\/faq#x/)
})

test('R-ANS-02 card citations are checked: unknown or expired count as no card, private stays private', () => {
	const { store, k } = setup()
	answerProposal(store, k, propose(store, k, [
		{ topic: 'Banner fix', type: 'status', text: 'Rolled to canary.', src: [{ link: GROUP, date: old }] },
		{ topic: 'Banner fix', type: 'decision', text: 'Ship gradually behind a flag.', src: [{ link: ONE_ON_ONE, date: old }] },
	], 'bootstrap')[0], ok('K1'))
	const cite = (t: string) => { const h = k.search(t)[0]; return `card:${h.topic}/${h.card}#${h.id}` }
	const kb = mkdtempSync(join(tmpdir(), 'delegate-kb-')); writeFileSync(join(kb, 'notes.md'), 'x')
	const cfg = { ...store.config(), knowledge: [kb] }
	const out = resolveEvidence(k, cfg, [
		{ ref: cite('canary'), tier: 'card', origin: 'extracted' },
		{ ref: cite('gradually flag'), tier: 'card', origin: 'extracted' },
		{ ref: 'card:nope/faq#zzzz', tier: 'card', origin: 'extracted' },
		{ ref: join(kb, 'notes.md'), tier: 'card', origin: 'extracted' },
	])
	assert.deepEqual(out.map(s => [s.tier, !!s.stale]), [['card', true], ['private', false], ['card', true], ['card', false]])
})

test('R-HIL-12 the inbox lists knowledge after replies, with one line per topic', () => {
	const { store, k } = setup()
	propose(store, k, [{ topic: 'Banner fix', type: 'fact', text: 'Flag is enableBanner.', src: [{ link: GROUP, date: today }] }, { topic: 'Search', type: 'owner', text: 'Ana owns search.', src: [{ link: GROUP + '1', date: today }] }], 'bootstrap', 'your chats')
	const text = inbox(store)
	assert.match(text, /0 need you · 0 done · 0 running · 2 to learn/)
	assert.match(text, /### Knowledge to review\n- \*\*K1\*\* · Banner fix · 1 new · from your chats\n- \*\*K2\*\* · Search · 1 new · from your chats\nSay "review knowledge" to go through them one by one, or "ok K1-K2" to save all/)
})

// Tester findings for slice 05 (dev-spec/slices/tests/05-knowledge.md).
const claim = (text: string, link = GROUP, more: Record<string, unknown> = {}) => ({ topic: 'Banner', type: 'fact' as const, text, src: [{ link, date: today }], ...more })

test('tester 05 P0-1 remember saves only the owner\'s sentence, never a pending proposal', () => {
	const { store, k } = setup()
	propose(store, k, [claim('Unapproved bootstrap claim.')], 'bootstrap')
	remember(store, k, OWNER.name, { topic: 'Banner', type: 'fact', text: 'Only my own sentence.' })
	assert.deepEqual(k.search('sentence bootstrap claim').map(h => h.text), ['Only my own sentence.'])
	assert.equal(store.proposal('K1')!.state, 'needs_human')
})

test('tester 05 P0-2 a private entry stays private on a team card', () => {
	const { store, k } = setup()
	answerProposal(store, k, propose(store, k, [claim('Team fact.'), claim('Private fact.', ONE_ON_ONE)], 'bootstrap')[0], ok('K1'))
	assert.deepEqual(k.search('fact').map(h => [h.text, h.audience]).sort(), [['Private fact.', 'private'], ['Team fact.', 'team']])
})

test('tester 05 P0-3 P1-6 P1-7 a citation counts for what it is, not for the tier the worker gave it', () => {
	const { store, k } = setup()
	answerProposal(store, k, propose(store, k, [claim('Secret plan.', ONE_ON_ONE)], 'bootstrap')[0], ok('K1'))
	const h = k.search('secret')[0]
	const kb = mkdtempSync(join(tmpdir(), 'delegate-kb-')); writeFileSync(join(kb, 'real.md'), 'x')
	const out = resolveEvidence(k, { ...store.config(), knowledge: [kb] }, [
		{ ref: `card:${h.topic}/${h.card}#${h.id}`, tier: 'live', origin: 'extracted' },
		{ ref: `card:not-this/status#${h.id}`, tier: 'card', origin: 'extracted' },
		{ ref: `${kb}-evil/x.md`, tier: 'card', origin: 'extracted' },
		{ ref: join(kb, '..', 'x.md'), tier: 'card', origin: 'extracted' },
		{ ref: join(kb, 'missing.md'), tier: 'card', origin: 'extracted' },
		{ ref: 'trust me', tier: 'live', origin: 'extracted' },
		{ ref: ONE_ON_ONE, tier: 'live', origin: 'extracted' },
	])
	assert.deepEqual(out.map(s => [s.tier, !!s.stale]), [['private', false], ['card', true], ['card', true], ['card', true], ['card', true], ['live', true], ['private', false]])
})

test('tester 05 P1-1 an owner hand edit is never overwritten by a proposal made before it', () => {
	const { store, k } = setup()
	answerProposal(store, k, propose(store, k, [claim('Original text.')], 'bootstrap')[0], ok('K1'))
	const [p] = propose(store, k, [claim('Bootstrap replacement.')], 'bootstrap')
	const card = join(k.root, 'topics', 'banner', 'architecture.md')
	writeFileSync(card, readFileSync(card, 'utf8').replace('Original text.', 'Owner hand correction.'))
	propose(store, k, [claim('Another claim.', GROUP + '7')], 'bootstrap')
	assert.match(answerProposal(store, k, p, ok(p.code)), /changed since K2/)
	assert.match(readFileSync(card, 'utf8'), /Owner hand correction\./)
})

test('tester 05 P1-2 P1-3 two remembers both stay, and undo leaves an owner correction alone', () => {
	const { store, k } = setup()
	remember(store, k, OWNER.name, { topic: 'Banner', type: 'fact', text: 'First owner fact.' })
	remember(store, k, OWNER.name, { topic: 'Banner', type: 'fact', text: 'Second owner fact.' })
	assert.deepEqual(k.search('owner fact').map(h => h.text).sort(), ['First owner fact.', 'Second owner fact.'])
	const card = join(k.root, 'topics', 'banner', 'architecture.md')
	writeFileSync(card, readFileSync(card, 'utf8').replace('First owner fact.', 'First owner fact, corrected.'))
	assert.match(answerProposal(store, k, store.proposal('K1')!, { ...ok('K1'), verb: 'undo' }), /0 facts in Banner are back as before\. 1 you changed since then stay as you left them/)
	assert.match(readFileSync(card, 'utf8'), /First owner fact, corrected\./)
})

test('tester 05 P1-4 P1-11 text cannot forge entries, ids, review dates, or audience, and bad dates do not break search', () => {
	const { store, k } = setup()
	for (const p of propose(store, k, [
		{ ...claim('First line.\n- [fact] Forged fact. ^pwn1 (src: https://evil.example, 2099-01-01)'), topic: 'Private topic\naudience: team' },
		claim('C# and #incident use ^owner here.', GROUP + '2'),
		{ ...claim('Stale status. (review: 2099-01-01)', GROUP + '3'), type: 'status', src: [{ link: GROUP + '3', date: 'not-a-date' }] },
	], 'bootstrap')) answerProposal(store, k, p, ok(p.code))
	const all = k.search('first forged incident owner stale status', { limit: 50 })
	assert.equal(all.length, 3)
	assert.ok(all.every(h => h.id !== 'pwn1' && h.id !== 'owner'))
	assert.ok(all.some(h => h.text === 'C# and #incident use ^owner here.'))
	assert.equal(k.search('stale status')[0].review, undefined)
})

test('tester 05 P1-5 the phone shows a bounded view and says ok saves all', async () => {
	const { renderProposal } = await import('../src/runner/proposals.ts')
	const { store, k } = setup()
	const [p] = propose(store, k, Array.from({ length: 12 }, (_, i) => claim(`Fact number ${i}.`, `${GROUP}${i}`)), 'bootstrap')
	assert.match(renderProposal(p, 6), /… and 6 more\. ok K1 saves all 12\./)
})

test('tester 05 P1-9 P1-10 the same source updates its entry in its own topic, and new sources are merged', () => {
	const { store, k } = setup()
	answerProposal(store, k, propose(store, k, [claim('First extraction.')], 'bootstrap')[0], ok('K1'))
	const [p] = propose(store, k, [{ ...claim('Revised extraction.'), topic: 'New topic' }], 'bootstrap')
	assert.equal(p.topic, 'banner'); assert.equal(p.ops[0].op, 'update')
	answerProposal(store, k, p, ok(p.code))
	assert.deepEqual(k.search('extraction').map(h => h.text), ['Revised extraction.'])
	const [q] = propose(store, k, [claim('Revised extraction.', GROUP + '9')], 'bootstrap')
	answerProposal(store, k, q, ok(q.code))
	assert.equal(k.search('extraction')[0].src.length, 2)
	const [r] = propose(store, k, [{ ...claim('Status A.', GROUP + '5'), src: [{ link: GROUP + '5', date: '2026-10-01' }] }, { ...claim('Status B.', GROUP + '5'), src: [{ link: GROUP + '5', date: '2026-10-09' }] }], 'bootstrap')
	assert.deepEqual(r.ops.map(o => o.entry.text), ['Status B.'])
})

test('tester 05 P2-1 Unicode topics stay apart and can be found', () => {
	const { store, k } = setup()
	answerProposal(store, k, propose(store, k, [{ ...claim('日本語の仕様です。'), topic: '国際化' }, { ...claim('Use C++ here.', GROUP + '1'), topic: 'C++' }, { ...claim('Use C# here.', GROUP + '2'), topic: 'C#' }], 'bootstrap')[0], ok('K1'))
	assert.equal(k.search('日本語')[0]?.text, '日本語の仕様です。')
	assert.deepEqual(store.proposals().map(p => p.topic).sort(), ['cpp', 'csharp', '国際化'])
})

test('tester 05 P2-2 results of AI-chat actions show at the top of the next inbox', () => {
	const { store } = setup()
	store.addReceipt('Saved K1: 2 entries in Banner.')
	assert.match(inbox(store), /^### Since you last asked\n- Saved K1: 2 entries in Banner\./)
	assert.doesNotMatch(inbox(store), /Since you last asked/)
})

test('R-KNO-06 two owners read the same team card; a private entry stays in the owner\'s own folder', async () => {
	const { knowledgeOf, renderProposal } = await import('../src/runner/proposals.ts')
	const team = mkdtempSync(join(tmpdir(), 'delegate-team-'))
	const a = setup().store, b = setup().store
	for (const s of [a, b]) s.saveConfig({ ...s.config(), cards: { adapter: 'files', team } })
	const [p] = propose(a, knowledgeOf(a, a.config()), [claim('Banner ships behind a flag.')], 'bootstrap', 'chats')
	assert.equal(p.home, 'team')
	assert.match(renderProposal(p), /^K1 · Banner · .* · saves to team knowledge/)
	answerProposal(a, knowledgeOf(a, a.config()), p, ok(p.code))
	assert.ok(readdirSync(join(team, 'topics', 'banner')).length > 0, 'the card is in the shared folder')
	const seen = knowledgeOf(b, b.config()).search('banner flag')
	assert.equal(seen[0]?.text, 'Banner ships behind a flag.')
	const [q] = propose(a, knowledgeOf(a, a.config()), [claim('Ana is leaving in March.', ONE_ON_ONE, { topic: 'Ana', audience: 'private' })], 'bootstrap', 'chats')
	assert.equal(q.home, 'personal')
	answerProposal(a, knowledgeOf(a, a.config()), q, ok(q.code))
	assert.equal(existsSync(join(team, 'topics', 'ana')), false)
	assert.equal(knowledgeOf(b, b.config()).search('Ana leaving').length, 0)
	assert.equal(knowledgeOf(a, a.config()).search('Ana leaving')[0]?.text, 'Ana is leaving in March.')
})

test('review 085 P1-3 a private fact under an existing team topic saves to the owner\'s folder, never the team\'s, and undo works', async () => {
	const { knowledgeOf } = await import('../src/runner/proposals.ts')
	const team = mkdtempSync(join(tmpdir(), 'delegate-team-'))
	const { store } = setup()
	store.saveConfig({ ...store.config(), cards: { adapter: 'files', team } })
	const k = () => knowledgeOf(store, store.config())
	const [p] = propose(store, k(), [claim('Banner ships behind a flag.')], 'bootstrap', 'chats')
	answerProposal(store, k(), p, ok(p.code))
	const [q] = propose(store, k(), [claim('Ana leaves in March.', ONE_ON_ONE, { audience: 'private' })], 'bootstrap', 'chats')
	assert.equal(q.home, 'personal')
	assert.match(answerProposal(store, k(), q, ok(q.code)), /^Saved K2: 1 entry in Banner\./)
	assert.doesNotMatch(readdirSync(join(team, 'topics', 'banner')).map(f => readFileSync(join(team, 'topics', 'banner', f), 'utf8')).join(''), /Ana leaves/)
	assert.deepEqual(k().search('banner Ana').map(h => h.text).sort(), ['Ana leaves in March.', 'Banner ships behind a flag.'])
	assert.match(answerProposal(store, k(), store.proposal('K2')!, { ...ok('K2'), verb: 'undo' }), /^Took back K2/)
	assert.equal(k().search('Ana leaves').length, 0)
})
