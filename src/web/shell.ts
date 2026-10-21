import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, WEB_DIR } from '../paths.ts'
import { bundlePage } from './page-bundle.ts'
import type { View } from './view.ts'
import { NAME, CMD } from '../brand.ts'

export type Mode = 'page' | 'panel' | 'snapshot'

// How the client reaches Delegate in each mode. Each defines call, result, data, and automate (design-spec/client-contract.md).
const TRANSPORT: Record<Mode, string> = {
	page: `const T=new URLSearchParams(location.search).get('t');const J=async(r)=>{const x=await r.json().catch(()=>null);if(!x)throw new Error('offline');return x};
window.DELEGATE_IO={
call:async(command,seenAt)=>{const r=await fetch('/act?t='+T,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command,seenAt})});const j=await J(r);return{ok:r.ok,text:j.text,ids:j.ids||[]}},
result:async(ids,code)=>J(await fetch('/result?t='+T+'&code='+encodeURIComponent(code)+'&ids='+ids.join(','))),
data:async(since,ui)=>J(await fetch('/data?t='+T+(since?'&since='+encodeURIComponent(since):'')+(ui==='new'?'&ui=new':''))),
ui:async(b)=>J(await fetch('/ui?t='+T,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)})),
numbers:async(w)=>{const r=await fetch('/numbers?t='+T+'&window='+encodeURIComponent(w));if(!r.ok)throw new Error('offline');return J(r)},
automate:async(input)=>{const r=await fetch('/automate?t='+T,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});return J(r)},
settings:async(key,value)=>{const r=await fetch('/settings?t='+T,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key,value})});return J(r)},
seen:async(filters,at)=>{await fetch('/seen?t='+T,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filters,at})})}};`,
	panel: `const app=new globalThis.McpExtApps.App({name:'${NAME} inbox',version:'1'});await app.connect();
const txt=r=>(r.content||[]).map(c=>c.text||'').join(' ');const tool=(name,args)=>app.callServerTool({name,arguments:args});
window.DELEGATE_IO={
call:async(command,seenAt)=>{const r=await tool('act',{command,seenAt});return{ok:!r.isError,text:txt(r),ids:(r.structuredContent||{}).ids||[]}},
result:async(ids,code)=>(await tool('act_result',{ids,code})).structuredContent||{applied:false},
data:async(since,ui)=>(await tool('inbox_view',{...(since?{since}:{}),...(ui==='new'?{ui}:{})})).structuredContent,
ui:async(b)=>(await tool('ui_save',b)).structuredContent,
numbers:async(w)=>{const r=await tool('numbers_view',{window:w});if(r.isError||!r.structuredContent)throw new Error('offline');return r.structuredContent},
automate:async(input)=>(await tool('automate_now',input)).structuredContent};`,
	snapshot: 'window.DELEGATE_IO=null;',
}

const safe = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

// The theme is set before the first paint, so a dark choice never flashes light.
const THEME_FIRST = `<script>try{var t=localStorage.getItem('delegate-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}</script>`

// The page's script. From source there is no app.js: the page's TypeScript is bundled here (src/web/page-bundle.ts).
// Without esbuild (npm ci --omit=dev, a copied source tree) the built dist/web/app.js serves instead, and that is said once.
// A page that cannot be built (a disallowed import) is not hidden behind an old one: the error reaches the caller.
let warned = false
// The bundler, replaceable in tests.
export const pageBuild = { bundle: bundlePage }
export function pageScript(bundle: (root: string) => string = pageBuild.bundle, root = ROOT, webDir = WEB_DIR): string {
	if (!existsSync(join(webDir, 'app.ts'))) return readFileSync(join(webDir, 'app.js'), 'utf8')
	try { return bundle(root) } catch (e) {
		if ((e as { code?: string } | null)?.code !== 'MODULE_NOT_FOUND') throw e
		if (!warned) { warned = true; console.error(`The page could not be built from source, so it uses dist/web/app.js: ${String((e as Error)?.message ?? e).split('\n')[0]}`) }
		return readFileSync(join(root, 'dist', 'web', 'app.js'), 'utf8')
	}
}

// One HTML shell for the browser page, the chat panel, and the read-only snapshot. All drawing happens in app.js from the view.
export function renderApp(view: View, mode: Mode, bundle = ''): string {
	const css = readFileSync(join(WEB_DIR, 'app.css'), 'utf8'), app = pageScript()
	const boot = `window.DELEGATE=${safe({ mode, view, name: NAME, cmd: CMD })};`
	const scripts = mode === 'panel'
		? `<script type="module">${bundle}\n${boot}\n${TRANSPORT.panel}\n${app}</script>`
		: `<script>${boot}\n${TRANSPORT[mode]}</script><script>${app}</script>`
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${NAME}</title><style>${css}</style>${mode === 'snapshot' ? '' : THEME_FIRST}</head><body><div id="app" data-mode="${mode}"></div>${scripts}</body></html>`
}
