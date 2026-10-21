"use strict";
(() => {
  // src/web/app/model/format.ts
  var first = (n) => String(n || "Someone").split(" ")[0];
  var plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  var hueOf = (name) => {
    let h = 0;
    for (const c of name) h = h * 31 + c.charCodeAt(0) >>> 0;
    return [210, 160, 25, 280, 340, 45][h % 6];
  };
  var whoOf = (name) => ({ name, initials: name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(), hue: hueOf(name) });
  var time = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  function when(iso) {
    if (!iso) return "";
    const d = new Date(iso), day2 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day2(/* @__PURE__ */ new Date()) - day2(d)) / 864e5);
    if (diff === 0) return time(d);
    if (diff === 1) return `yesterday ${time(d)}`;
    if (diff === -1) return `tomorrow ${time(d)}`;
    if (Math.abs(diff) < 7) return `${d.toLocaleDateString([], { weekday: "short" })} ${time(d)}`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  var clock = (s2) => {
    const [h, m] = s2.split(":").map(Number);
    return time(new Date(2e3, 0, 1, h, m));
  };
  var mmss = (s2) => `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, "0")}`;
  function byDate(k) {
    const d = /* @__PURE__ */ new Date();
    if (k === "fri") d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
    else if (k === "week") d.setDate(d.getDate() + 7);
    else if (k !== "today") return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function doing(verb = "", name) {
    const v = verb.trim();
    if (/^skip\b/i.test(v)) return "Dismissing.";
    if (/^later\b/i.test(v)) return "Moving it to later.";
    if (/^edit\b/i.test(v)) return "Saving your edit.";
    if (/^(ok|send)\b/i.test(v)) return "Sending.";
    if (/^pick\b/i.test(v)) return "Preparing the reply for that option.";
    if (/^ask\b/i.test(v)) return `Asking ${name}.`;
    if (/^[A-Z]\d+\s*:/i.test(v)) return "Updating the draft with your answer.";
    return `Working on "${v.length > 60 ? v.slice(0, 58) + "…" : v}".`;
  }
  function sourceChip(s2) {
    if (s2.label) return s2.label;
    if (s2.ref.startsWith("card:")) return s2.ref.slice(5).split(/[/#]/)[0].replace(/-/g, " ");
    if (!/^https?:\/\//.test(s2.ref)) return s2.ref.slice(0, 60);
    let u;
    try {
      u = new URL(s2.ref);
    } catch {
      return s2.ref.slice(0, 60);
    }
    const pr = u.pathname.match(/\/pullrequest\/(\d+)/);
    if (pr) return `PR ${pr[1]}`;
    if (u.hostname === "teams.microsoft.com") return "Teams message";
    return u.hostname.replace(/^www\./, "");
  }
  var refusalOf = (msg) => /^Before you ok\b/.test(msg) ? { label: "Check this first.", cls: "check" } : { label: "Not done.", cls: "refused" };
  var typed = /"[^"]*\b[A-Z]\d{1,3}\b[^"]*"/;
  var forPage = (text2 = "") => text2.replace(/^Before you ok [A-Z]\d{1,3}:/, "Before it goes ahead:").split(/(?<=[.?!])\s+(?=[A-Z])/).filter((s2) => !typed.test(s2)).join(" ").trim();

  // src/web/app/io/transport.ts
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // src/web/app/io/poll.ts
  function poll(io, every, o) {
    void (async () => {
      let back = 0;
      for (; ; ) {
        await sleep(back || (o.waiting() ? every * 2 : every * 10));
        try {
          const nv = await io.data(o.since(), o.ui?.());
          back = 0;
          o.got(nv);
        } catch {
          back = Math.min((back || every) * 2, 15e3);
          o.lost();
        }
      }
    })();
  }

  // src/web/app/model/derive.ts
  var DONE_KINDS = { replies: ["reply", "review"], reviews: ["review"], changes: ["change"], reminders: ["reminder"], learned: ["learned"], catchup: ["catchup"] };
  var CHIP_LABEL = { catchup: "Catch up" };
  var KIND_KEY = { reply: "replies", review: "replies", change: "changes", reminder: "reminders", learned: "learned", catchup: "catchup" };
  var seenIn = (v) => (k) => v.seen?.[k] ?? v.since ?? "";
  var itemSeen = (v) => (code) => v.seen?.[`item:${code}`];
  var isNew = (r, seen, item = () => void 0) => !r.own && !!KIND_KEY[r.kind] && r.at > seen(KIND_KEY[r.kind]) && !((item(r.code) ?? "") >= r.at);
  var newCount = (v) => v.done.filter((r) => isNew(r, seenIn(v), itemSeen(v))).length;
  var latest = (...xs) => xs.filter((x) => !!x).sort().at(-1) ?? "";
  var rowMark = (v, r) => latest(v.seen?.[`item:${r.code}`], v.seen?.[`item:${r.act}`], r.section === "catchup" ? v.seen?.catchup : void 0, v.since);
  function freshOf(r, mark) {
    const f = r.fresh;
    if (!f) return void 0;
    if (f.back && f.back > mark && f.born <= mark) return "back";
    return f.changed && f.changed > mark && !r.chips?.some((c) => c.kind === "changed") ? "new" : void 0;
  }
  var FRESH_TEXT = { new: "New", back: "Back to you" };
  function orderOf(order, needs, handled, later) {
    const live = new Set(needs.map((c) => c.code));
    const next2 = order.filter((c) => live.has(c) || handled(c));
    for (const c of needs) if (!next2.includes(c.code)) next2.push(c.code);
    return next2.sort((a, b) => (later(a) ? 1 : 0) - (later(b) ? 1 : 0));
  }
  var dirty = (u) => u.touched || u.editing || !!u.answer || !!u.other || !!u.ask;
  var tabsOf = (v, snap, numbers = false) => [["home", "Home"], ["focus", "Needs you"], ["done", "Done", snap ? 0 : newCount(v)], ["ongoing", "Ongoing"], ...v.knowledge.length ? [["knowledge", "To learn"]] : [], ...numbers && !snap ? [["numbers", "Numbers"]] : [], ...v.settings ? [["settings", "Settings"]] : []];
  function changeLabel(c, n, reply) {
    if (c.type === "meeting" && n) return "Send and create invite";
    const comments = c.changes.length && c.changes.every((x) => /comment|review/i.test(x.action));
    const what = comments ? `Post ${plural(n, "comment")}` : `Make ${plural(n, "change")}`;
    return n ? reply ? `${what} and reply` : what : reply ? "Send reply only" : "Nothing to do";
  }
  var sendOrEdit = (c, u) => u.text != null && u.text.trim() !== c.draft.text.trim() ? { label: "Send your version", cmd: `send ${c.code}: ${u.text.trim()}`, kind: "finish" } : { label: c.draft?.holding ? "Send holding reply" : "Send", cmd: `ok ${c.code}`, kind: "finish" };
  var replyPrimary = (c, u) => c.draft ? c.changes.length ? { ...sendOrEdit(c, u), label: changeLabel(c, c.changes.length, true) } : sendOrEdit(c, u) : { label: changeLabel(c, c.changes.length, false), cmd: `ok ${c.code}`, kind: "finish", disabled: !c.changes.length };
  function choicePrimary(c, u, name) {
    if (u.otherOn) return { label: "Draft reply", cmd: `${c.code}: ${u.other.trim()}`, kind: "draft", disabled: !u.other.trim(), hint: "Nothing is sent yet. You will see the reply first.", verb: `${c.code}: your answer` };
    const picks = (u.pick ?? []).slice().sort((a, b) => a - b), server = (c.picked ?? []).slice().sort((a, b) => a - b);
    const changed = u.pick && picks.join() !== server.join();
    if (c.choices.multi && changed) return { label: picks.length ? "Draft reply" : "Pick at least one", cmd: `pick ${c.code} ${picks.join(", ")}`, kind: "draft", disabled: !picks.length, hint: `${name} writes the reply from your picks. Nothing is sent yet.` };
    if (c.draft?.preview && server.length) {
      const n = c.changes.length;
      return { label: n ? changeLabel(c, n, true) : "Send", cmd: `ok ${c.code}`, kind: "finish" };
    }
    return { label: c.type === "meeting" ? "Send and create invite" : "Send", cmd: `ok ${c.code}`, kind: "finish", disabled: true, hint: c.choices.multi ? "Pick what to include." : "Pick an option to see the exact reply.", verb: `pick ${c.code} 1` };
  }
  function reviewPrimary(c, u) {
    const on = [...u.cmts ?? new Set(c.changes.map((x) => x.n))].sort((a, b) => a - b), all = on.length === c.changes.length;
    const edited = u.text != null && c.draft && u.text.trim() !== c.draft.text.trim();
    const label = c.promise && on.length === 1 && !c.draft ? c.changes.find((x) => x.n === on[0]).action : changeLabel(c, on.length, !!c.draft);
    if (edited) return all ? { label: `${label.replace(/ and reply$/, "")} and send your version`, cmd: `send ${c.code}: ${u.text.trim()}`, kind: "finish" } : { label, cmd: "", kind: "finish", disabled: true, hint: "To change the reply and skip a change, do one at a time." };
    const skip = c.changes.map((x) => x.n).filter((n) => !on.includes(n));
    return { label, cmd: all ? `ok ${c.code}` : `ok ${c.code} except ${skip.join(", ")}`, kind: "finish", disabled: !on.length && !c.draft };
  }
  var PRIMARY = {
    reply: replyPrimary,
    question: (c, u) => ({ label: "Draft reply", cmd: `${c.code}: ${u.answer.trim()}`, kind: "draft", disabled: !u.answer.trim(), hint: "Nothing is sent yet. You will see the reply first.", verb: `${c.code}: your answer` }),
    choice: choicePrimary,
    meeting: (c, u, name) => c.choices ? choicePrimary(c, u, name) : replyPrimary(c, u),
    review: reviewPrimary
  };
  var reviewAgainPrimary = (c, u) => c.reviewAgain && !(c.type === "question" && u.answer.trim()) ? { label: "Review again", cmd: c.reviewAgain, kind: "draft", hint: "The PR changed since the review. Nothing is changed or sent; you will see the new result first.", verb: c.reviewAgain } : void 0;
  var primaryOf = (c, u, name) => c.promise?.failed !== void 0 && !c.draft ? { label: "Check again", cmd: `ok ${c.code}`, kind: "finish" } : reviewAgainPrimary(c, u) ?? (PRIMARY[c.type] || PRIMARY.reply)(c, u, name);
  var factsOn = (k, u) => u.facts ?? new Set(k.facts.map((_, i) => i + 1));
  var kCmd = (k, u) => {
    const on = factsOn(k, u);
    return on.size === k.facts.length ? `ok ${k.code}` : `ok ${k.code} ${[...on].sort((a, b) => a - b).map((x) => `#${x}`).join(" ")}`;
  };
  function sinceOf(v) {
    const at = v.since ?? new Date(Date.parse(v.now) - 864e5).toISOString();
    const fresh = (v.done ?? []).filter((r) => r.at > at);
    const replies = fresh.filter((r) => r.kind === "reply" && !r.inTeams), people = new Set(replies.map((r) => r.who.name)).size;
    const byRule = new Set(replies.filter((r) => r.by.startsWith("by rule")).map((r) => r.who.name)).size;
    const reviews = fresh.filter((r) => r.kind === "review").length, fyis = fresh.filter((r) => r.kind === "catchup").length, handled = v.next?.handled ?? 0;
    const parts = [
      people ? { text: `replied to ${people}${byRule ? ` (${byRule} by rule)` : ""}`, href: "#done/replies" } : void 0,
      reviews ? { text: plural(reviews, "review"), href: "#done/reviews" } : void 0,
      fyis ? { text: fyis === 1 ? "1 FYI" : `${fyis} FYIs`, href: "#done/catchup" } : void 0,
      handled ? { text: `${handled} handled`, href: "#numbers" } : void 0
    ].filter((p) => !!p);
    return { at, parts };
  }
  var RESULTS = ["Both work", "Issues found", "Blocked"];

  // src/web/app/model/find.ts
  function teamsMessage(q) {
    const m = /^https:\/\/teams\.microsoft\.com\/l\/message\/([^/?#]+)\/(\d+)/i.exec(q.trim());
    if (!m) return void 0;
    try {
      return { chat: decodeURIComponent(m[1]), msg: m[2] };
    } catch {
      return void 0;
    }
  }
  function termsOf(q) {
    const t = q.trim().toLowerCase();
    if (/^https?:\/\//.test(t)) {
      const n = t.match(/\d{3,}/g)?.at(-1);
      return n ? [n] : [];
    }
    return t.split(/\s+/).map((w) => w.replace(/^[#"'(]+|[?"'),.:;!]+$/g, "")).filter(Boolean);
  }
  var escRe = (s2) => s2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var matcher = (t) => /^\d+$|^[a-z]\d+$/.test(t) ? new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(t)}($|[^\\p{L}\\p{N}])`, "u") : new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(t)}`, "u");
  var hay = (parts) => parts.filter(Boolean).join(" \n ").toLowerCase();
  var nowText = (r) => hay([r.act, r.code, r.who?.name, r.facts.who, r.facts.where, r.headline, r.facts.quote?.by, r.facts.quote?.text, ...(r.facts.notes ?? []).map((n) => n.text), r.gist, r.draft]);
  var doneText = (r) => hay([r.code, r.who.name, r.sentence, r.ask, r.said, r.gist, r.by, r.text]);
  var sameMsg = (r, m) => {
    if (r.msgs?.includes(`${m.chat}|${m.msg}`)) return true;
    const x = r.teams ? teamsMessage(r.teams) : void 0;
    return !!x && x.msg === m.msg && x.chat === m.chat;
  };
  function find(v, q) {
    const n = v.next, rows2 = n ? [...n.move, ...n.working, ...n.waiting, ...n.catchup.rows] : [];
    const msg = teamsMessage(q);
    if (msg) {
      const now2 = rows2.filter((r) => sameMsg(r, msg)), done2 = (v.done ?? []).filter((r) => sameMsg(r, msg) && !now2.some((x) => x.act === r.code || x.code === r.code));
      const item = now2[0]?.act ?? done2[0]?.code;
      return { now: now2, done: done2, link: { href: q.trim(), ...item ? { item } : {} } };
    }
    const ms = termsOf(q).map(matcher);
    if (!ms.length) return { now: [], done: [] };
    const hit = (text2) => ms.every((m) => m.test(text2));
    const now = rows2.filter((r) => hit(nowText(r)));
    const done = (v.done ?? []).filter((r) => hit(doneText(r)) && !now.some((x) => x.act === r.code || x.code === r.code));
    return { now, done };
  }

  // src/web/app/model/forms.ts
  var MARKS = [["wrong", "Wrong", "What should it have said?", "Draft a correction"], ["incomplete", "Incomplete", "What was missing?", "Draft what was missing"], ["unneeded", "Should not have replied", "Anything else? (optional)", "Note it"]];
  var markCommand = (code, mark, note) => `${mark || "wrong"} ${code}${note ? `: ${note}` : ""}`;
  var BY = [["", "No date"], ["today", "Today"], ["fri", "Friday"], ["week", "Next week"]];
  var INTERVALS = [[60, "1 h"], [120, "2 h"], [240, "4 h"], [480, "8 h"], [1440, "1 day"]];
  var EVERY = { day: "Every day", weekday: "Every weekday", week: "Every Monday" };
  var HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  var peopleOf = (v) => {
    const asked = v.needs.map((c) => c.who.name);
    return v.people.slice().sort((a, b) => (asked.includes(a.name) ? 0 : 1) - (asked.includes(b.name) ? 0 : 1));
  };
  var newReminder = (to) => ({ to, text: "Reminder: please send me an update.", every: "weekday", at: "16:00", someone: false });
  var automationInput = (f, v) => ({ to: f.to, chatId: v.people.find((p) => p.name === f.to)?.chat, text: f.text.trim(), every: f.every, at: f.at, ...f.every === "week" ? { day: 1 } : {} });
  var sheetWatchCommand = (f) => `watch: "${f.text.trim()}"${f.by ? ` by ${byDate(f.by)}` : ""}${f.push ? " push" : ""}`;
  var rowWatchOf = (r) => ({ target: r.watch?.target ?? r.sentence, until: r.watch?.until ?? "it is done", by: "" });
  var rowWatchCommand = (code, f) => `watch ${code}: "${f.target.trim()}"${f.until.trim() ? ` until "${f.until.trim()}"` : ""}${f.by ? ` by ${byDate(f.by)}` : ""}`;

  // src/web/app/state/store.ts
  var env = { snap: false, name: "", cmd: "", start: void 0, io: null, poll: 2e3, ui: "classic", panel: false };
  var V;
  var S = { route: "home", cur: null, ui: {}, fresh: {}, order: [], done: /* @__PURE__ */ new Map(), later: /* @__PURE__ */ new Set(), offline: false, deferred: false, sheet: null, form: null, formBusy: false, formErr: "", newAuto: null, set: {}, num: { win: "this", busy: false, failed: false, seq: 0, how: /* @__PURE__ */ new Set() } };
  function init(boot3, io, poll2) {
    Object.assign(env, { snap: boot3.mode === "snapshot", panel: boot3.mode === "panel", name: boot3.name, cmd: boot3.cmd, start: boot3.view.version?.code, io, poll: poll2 });
    V = boot3.view;
  }
  var setView = (v) => {
    V = v;
  };
  function U(code) {
    return S.ui[code] ??= { status: "ready", msg: "", lost: false, stale: false, touched: false, pick: null, otherOn: false, other: "", editing: false, text: null, answer: "", ask: "", cmts: null, facts: null, threadOpen: false, whyOpen: false, dbgOpen: false, menu: false };
  }
  var IDLE = Object.freeze({ status: "ready", msg: "", lost: false, stale: false, touched: false, pick: null, otherOn: false, other: "", editing: false, text: null, answer: "", ask: "", cmts: null, facts: null, threadOpen: false, whyOpen: false, dbgOpen: false, menu: false });
  var peek = (code) => S.ui[code] ?? IDLE;
  var cardOf = (code) => V.needs.find((c) => c.code === code) || V.knowledge.find((c) => c.code === code);
  function syncOrder() {
    S.order = orderOf(S.order, V.needs, (c) => S.done.has(c), (c) => S.later.has(c));
  }
  var queue = () => S.order.map((c) => V.needs.find((x) => x.code === c) || S.done.get(c)?.card).filter((c) => !!c);
  var openCards = () => queue().filter((c) => !S.done.has(c.code));
  function replaceCard(c) {
    const list2 = /^K/.test(c.code) ? V.knowledge : V.needs, i = list2.findIndex((x) => x.code === c.code);
    if (i >= 0) list2[i] = c;
    else list2.push(c);
    syncOrder();
  }
  var hooks = {
    render: (_enter) => {
    },
    renderSoon: () => {
    },
    say: (_t, _toast) => {
    },
    typing: () => false
  };

  // src/web/app/state/actions.ts
  var render = (enter) => hooks.render(enter);
  var renderSoon = () => hooks.renderSoon();
  var say = (t, toast) => hooks.say(t, toast);
  var cards = (v, key) => v[key];
  var lastDrawn = Date.now();
  function merge(nv) {
    for (const key of ["needs", "knowledge"]) nv[key] = cards(nv, key).map((c) => {
      const old = cards(V, key).find((x) => x.code === c.code), u = S.ui[c.code];
      if (old && old.rev !== c.rev && u && u.status !== "pending" && dirty(u)) {
        S.fresh[c.code] = c;
        u.stale = true;
        return old;
      }
      return c;
    });
    for (const key of ["needs", "knowledge"]) for (const c of cards(V, key)) if (S.ui[c.code]?.status === "pending" && !cards(nv, key).some((x) => x.code === c.code)) cards(nv, key).push(c);
    nv.since = V.since;
    const same = !!V && JSON.stringify({ ...nv, now: "" }) === JSON.stringify({ ...V, now: "" }) && Date.now() - lastDrawn < 6e4;
    setView(nv);
    syncOrder();
    if (!same) {
      lastDrawn = Date.now();
      renderSoon();
    }
    if (env.start && nv.version?.code && nv.version.code !== env.start && !hooks.typing()) {
      say(`Updated to ${nv.version.code}. Reloading.`);
      setTimeout(() => location.reload(), 1200);
    }
  }
  var connected = (nv) => {
    if (S.offline) {
      S.offline = false;
      say("Connected again.", false);
    }
    merge(nv);
  };
  var lost = () => {
    if (!S.offline) {
      S.offline = true;
      renderSoon();
    }
  };
  async function refresh() {
    if (!env.io) return;
    try {
      const nv = await env.io.data(V.since, env.ui);
      connected(nv);
    } catch {
      lost();
    }
  }
  var rowRev = (act2) => {
    const n = V.next;
    return n ? [...n.move, ...n.working, ...n.waiting, ...n.catchup.rows].find((r) => r.act === act2)?.rev ?? "" : "";
  };
  async function act(key, code, cmd, kind, seenAt, by = "", sent) {
    const io = env.io;
    if (!io || !cmd) return;
    const u = U(key);
    Object.assign(u, { status: "pending", msg: "", lost: false, verb: cmd, menu: false, by, rev: kind === "row" ? rowRev(code) : void 0 });
    render();
    let r;
    try {
      r = await io.call(cmd, seenAt);
    } catch {
      Object.assign(u, { status: "ready", lost: true, msg: `Could not reach ${env.name}. Nothing was sent. Try again when the connection is back.` });
      S.offline = true;
      render();
      return;
    }
    if (!r.ok) {
      Object.assign(u, { status: kind === "row" ? "ready" : "refused", msg: r.text || `${env.name} could not do that.` });
      render();
      say(u.msg, false);
      return;
    }
    sent?.();
    if (kind === "row" && !r.ids?.length) return finish(key, code, { applied: true, text: r.text }, kind);
    let o, wait = env.poll, tries = 0;
    for (; ; ) {
      await sleep(wait);
      try {
        o = await io.result(r.ids, code);
      } catch {
        u.lost = true;
        if (!S.offline) S.offline = true;
        renderSoon();
        wait = Math.min(wait * 2, 15e3);
        continue;
      }
      if (u.lost || S.offline) {
        u.lost = false;
        S.offline = false;
        renderSoon();
      }
      wait = env.poll;
      const working = !o.card && /running|waiting|queued/.test(o.state || "");
      if (o.applied && !(kind === "draft" && working)) break;
      if (++tries > 90) {
        Object.assign(u, { status: "ready", msg: "Still working. Check again in a minute." });
        renderSoon();
        return;
      }
    }
    finish(key, code, r.ids.length ? o : { ...o, text: o.text || r.text }, kind);
  }
  function finish(key, code, o, kind) {
    const u = U(key);
    u.lost = false;
    if (kind === "row") {
      Object.assign(u, { status: "ready", msg: o.text || "Done." });
      say(o.text);
      refresh();
      return;
    }
    if ((kind === "ask" || kind === "mark") && !o.card) {
      Object.assign(u, { status: "ready", msg: "" }, kind === "mark" ? { marking: false, marknote: "" } : {});
      say(o.text);
      refresh();
      return;
    }
    if (o.card) {
      replaceCard(o.card);
      u.stale = false;
      delete S.fresh[code];
      if (kind === "finish") {
        Object.assign(u, { status: "refused", msg: o.text || "Nothing was changed." });
        say(u.msg, false);
        render();
        return;
      }
      Object.assign(u, { status: "ready", msg: "" });
      if (kind === "draft" || kind === "pick") Object.assign(u, { answer: "", other: "", otherOn: false, pick: null, editing: false, text: null, touched: false });
      if (kind === "keep") u.msg = o.text;
      if (kind === "later") {
        const o0 = openCards(), i0 = o0.findIndex((x) => x.code === code), next2 = o0[i0 + 1] || o0.find((x) => x.code !== code);
        S.later.add(code);
        syncOrder();
        say(o.text);
        if (S.route === "focus" && S.cur === code && next2) return go(next2.code);
      }
      if (kind === "draft") say("New draft ready. Nothing sent yet.");
      render();
      if (kind === "draft") document.getElementById(`pri-${code}`)?.focus();
      return;
    }
    const c = cardOf(code);
    u.status = "ready";
    if (c) S.done.set(code, { msg: o.text || "Done.", card: c });
    say(o.text);
    render();
    refresh();
    if (S.route === "focus" && S.cur === code) setTimeout(() => {
      if (S.route === "focus" && S.cur === code) step(1, code);
    }, 1200);
  }
  function viewing() {
    if (env.snap) return;
    const [base, sub] = S.route.split("/");
    if (base === "focus") {
      const cur = queue().find((c) => c.code === S.cur) || openCards()[0];
      if (cur) S.cur = cur.code;
    }
    if (base === "done") {
      const f = !sub ? "all" : sub === "closed" ? "catchup" : sub;
      S.seenOpen ??= {};
      const keys = f === "all" ? Object.values(KIND_KEY) : [f];
      if (S.seenFor !== f) {
        S.seenFor = f;
        for (const k of keys) S.seenOpen[k] = V.seen?.[k] ?? V.since ?? "";
        markSeen(f, keys);
      }
    }
    if (base === "now" && V.next && !S.find?.trim()) viewingNow(sub);
  }
  function viewingNow(sub) {
    const n = V.next, look = S.nowLook ??= {};
    const narrow = (document.getElementById("app")?.clientWidth ?? 1e3) <= 600;
    const shown = [...n.move, ...!narrow || sub === "working" ? n.working : [], ...!narrow || sub === "waiting" ? n.waiting : [], ...!narrow || sub === "catchup" ? n.catchup.rows : []];
    const later = [], now = [];
    for (const r of shown) {
      const opened = !!sub && (r.act === sub || r.code === sub), first2 = !(r.act in look);
      if (first2) look[r.act] = rowMark(V, r);
      const again = opened && latest(r.fresh?.changed, r.fresh?.back) > (V.seen?.[`item:${r.act}`] ?? "");
      if (!freshOf(r, look[r.act]) || !(first2 || again)) continue;
      (again ? now : later).push(.../* @__PURE__ */ new Set([`item:${r.act}`, `item:${r.code}`]));
    }
    if (now.length) markItems(now, 0);
    if (later.length) markItems(later, window.DELEGATE_LOOK_MS || 1500);
  }
  var itemT;
  var itemKeys = /* @__PURE__ */ new Set();
  var sending = /* @__PURE__ */ new Set();
  function markItems(keys, wait) {
    if (!wait) return sendItems(keys.filter((k) => !sending.has(k)));
    for (const k of keys) itemKeys.add(k);
    clearTimeout(itemT);
    itemT = setTimeout(() => {
      const ks = [...itemKeys];
      itemKeys.clear();
      sendItems(ks);
    }, wait);
  }
  function sendItems(ks) {
    const io = env.io;
    if (!S.route.startsWith("now") || S.find?.trim() || document.hidden || !io?.seen || !ks.length) return;
    const at = V.now;
    for (const k of ks) sending.add(k);
    io.seen(ks, at).then(() => {
      for (const k of ks) if ((V.seen?.[k] ?? "") < at) V.seen = { ...V.seen, [k]: at };
      render();
    }, () => void 0).finally(() => {
      for (const k of ks) sending.delete(k);
    });
  }
  function openRowWatch(code) {
    const r = V.done.find((x) => x.code === code) ?? V.catchUp?.top.find((x) => x.code === code);
    S.watchOpen = code;
    S.watchForm = r ? rowWatchOf(r) : null;
  }
  function step(d, from = S.cur) {
    const q = queue(), o = openCards();
    if (!o.length) {
      S.cur = null;
      return render();
    }
    const i = o.findIndex((c) => c.code === from);
    let next2;
    if (i < 0) {
      const qi = q.findIndex((c) => c.code === from);
      next2 = q.slice(qi + 1).find((c) => !S.done.has(c.code)) || o[0];
    } else next2 = o[i + d] || (from !== S.cur || S.later.has(from) ? o.find((c) => c.code !== from) : null);
    if (next2) go(next2.code);
    else render();
  }
  function go(code) {
    S.cur = code;
    if (location.hash !== `#focus/${code}`) history.replaceState(null, "", `#focus/${code}`);
    S.route = "focus";
    render(true);
    const o = openCards(), c = o.find((x) => x.code === code);
    document.getElementById(`card-${code}`)?.focus({ preventScroll: true });
    if (c) say(`Item ${o.indexOf(c) + 1} of ${o.length}, ${c.who.name}.`, false);
  }
  function startSheetWatch() {
    const cmd = sheetWatchCommand(S.wform);
    S.formBusy = true;
    render();
    env.io.call(cmd).then((r) => {
      S.formBusy = false;
      if (!r.ok) {
        S.formErr = r.text || "Could not start it.";
        render();
        return;
      }
      S.sheet = null;
      say(r.text);
      refresh();
      render();
    }, () => {
      S.formBusy = false;
      S.formErr = `Could not reach ${env.name}.`;
      render();
    });
  }
  function startRowWatch(code) {
    const cmd = rowWatchCommand(code, S.watchForm);
    S.watchOpen = null;
    act(`row:${code}`, code, cmd, "row");
  }
  async function createAutomation() {
    const f = S.form;
    S.formBusy = true;
    S.formErr = "";
    render();
    try {
      const r = await env.io.automate(automationInput(f, V));
      S.formBusy = false;
      if (!r.ok) {
        S.formErr = r.text || "Not created.";
        render();
        return;
      }
      S.sheet = null;
      S.newAuto = r.code ?? null;
      say(r.text);
      await refresh();
      render();
    } catch {
      S.formBusy = false;
      S.formErr = "Lost connection. Nothing was created. Try again.";
      render();
    }
  }
  function markCard(code) {
    const u = U(code);
    act(code, code, markCommand(code, u.mark, (u.marknote || "").trim()), "mark");
  }
  function ask(code) {
    const u = U(code), q = u.ask.trim();
    if (!q) return;
    u.ask = "";
    act(code, code, `ask ${code}: ${q}`, "ask", cardOf(code)?.rev);
  }
  function seenAll() {
    const at = V.now;
    env.io?.seen?.(["catchup"], at)?.then(() => {
      V.seen = { ...V.seen, catchup: at };
      refresh();
    });
  }
  var seenT;
  function markSeen(f, keys) {
    clearTimeout(seenT);
    seenT = setTimeout(() => {
      const io = env.io;
      if (S.route !== `done/${f}` && !(f === "all" && S.route === "done") || document.hidden || !io?.seen) return;
      const at = V.now;
      io.seen(keys, at).then(() => {
        for (const k of keys) V.seen = { ...V.seen, [k]: at };
        render();
      }, () => void 0);
    }, 1500);
  }
  function checkUpdate() {
    const io = env.io;
    if (!io || S.checking) return;
    const before = V.version?.checkedAt;
    S.checking = true;
    render();
    io.call("check update").then(async () => {
      for (let i = 0; i < 40 && V.version?.checkedAt === before; i++) {
        await sleep(3e3);
        await refresh();
      }
      S.checking = false;
      render();
    }, () => {
      S.checking = false;
      say("Could not reach the page server.", false);
      render();
    });
  }
  function saveSetting(key) {
    const row4 = V.settings.rows.find((r) => r.key === key), u = U(`set:${key}`), value = S.set[key] ?? row4?.value ?? "", io = env.io;
    if (!io?.settings) return;
    const undo = () => {
      if (row4?.kind === "switch") delete S.set[key];
    };
    Object.assign(u, { status: "pending", msg: "" });
    render();
    io.settings(key, value).then((r) => {
      Object.assign(u, { status: "ready", msg: r.text });
      if (r.ok) delete S.set[key];
      else undo();
      say(r.text, r.ok);
      refresh();
    }, () => {
      undo();
      Object.assign(u, { status: "ready", msg: "Could not reach the page server." });
      render();
    });
  }
  function toggleSetting(key) {
    const row4 = V.settings?.rows.find((r) => r.key === key);
    if (!row4 || U(`set:${key}`).status === "pending") return;
    S.set[key] = (S.set[key] ?? row4.value) === "true" ? "false" : "true";
    saveSetting(key);
  }
  function report(text2) {
    const io = env.io;
    if (!text2 || !io) return;
    io.call(`report: ${text2}`).then((r) => {
      if (r.ok) S.reporting = false;
      say(r.text, r.ok);
      render();
    }, () => say("Could not reach the page server.", false));
  }
  function missed(link) {
    const io = env.io;
    if (!link || !io) return;
    S.missing = true;
    S.missedLink = link;
    render();
    io.call(`missed ${link}`).then((r) => {
      S.missing = false;
      if (r.ok) {
        S.missedLink = "";
        if (S.find?.trim() === link) S.find = "";
      }
      say(r.text, r.ok);
      render();
      setTimeout(refresh, 5e3);
    }, () => {
      S.missing = false;
      say("Could not reach the page server.", false);
      render();
    });
  }
  function setFind(q) {
    S.find = q;
    render();
  }
  function findMissed() {
    const f = find(V, S.find ?? "");
    if (f.link && !f.link.item && !S.missing) missed(f.link.href);
  }

  // src/web/app/view/render.ts
  var exp;
  var current = () => exp;
  var field = () => {
    const a = document.activeElement;
    return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox" && a.type !== "radio";
  };
  var typing = () => field() && !!document.activeElement.value;
  function render2(enter = false) {
    if (S.composing && field()) {
      S.deferred = true;
      return;
    }
    if (S.pressing && Date.now() - S.pressing < 3e3) {
      S.flushT ??= setTimeout(() => {
        S.flushT = null;
        if (S.deferred && !typing()) render2();
      }, 3e3 - (Date.now() - S.pressing));
      S.deferred = true;
      return;
    }
    const a = document.activeElement, id = a && a.id, caret = a && typeof a.selectionStart === "number" ? a.selectionStart : null;
    S.deferred = false;
    viewing();
    S.composing = false;
    exp.draw(enter);
    if (id) {
      const el = document.getElementById(id);
      if (el && el !== document.activeElement) {
        el.focus({ preventScroll: true });
        if (caret != null && el.setSelectionRange) try {
          el.setSelectionRange(caret, caret);
        } catch {
        }
      }
    }
  }
  var renderSoon2 = () => {
    if (typing() && document.activeElement?.id !== "find") S.deferred = true;
    else render2();
  };
  function start(e) {
    exp = e;
    Object.assign(hooks, { render: render2, renderSoon: renderSoon2, typing, say: (t, toast = true) => {
      if (t) e.say(t, toast);
    } });
  }

  // src/web/app/view/theme.ts
  var THEMES = ["auto", "light", "dark"];
  var THEME_LABEL = { auto: "same as your system", light: "light", dark: "dark" };
  var theme = () => {
    let t;
    try {
      t = localStorage.getItem("delegate-theme");
    } catch {
      t = document.documentElement.dataset.theme;
    }
    return THEMES.includes(t ?? "") ? t : "auto";
  };
  var nextTheme = () => THEMES[(THEMES.indexOf(theme()) + 1) % THEMES.length];
  function applyTheme(t) {
    try {
      if (t === "auto") localStorage.removeItem("delegate-theme");
      else localStorage.setItem("delegate-theme", t);
    } catch {
    }
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }

  // src/web/app/model/ui.ts
  var hashUi = (hash) => /(?:^#|[&/])ui=(new|classic)\b/.exec(hash)?.[1];
  function pickUi(v, hash, cached2, snap = false) {
    if (snap) return "classic";
    const h = hashUi(hash);
    if (h) return h;
    const s2 = v?.ui;
    if (s2 && cached2 && (cached2.at ?? "") > (s2.at ?? "")) return cached2.ui;
    const choice = s2?.ui ?? cached2?.ui ?? "classic";
    return choice === "react" ? "new" : choice;
  }
  function newRoute(h) {
    const [base, sub] = h.split("/");
    if (base === "now" || base === "done" || base === "numbers" || base === "settings" || base === "knowledge") return h;
    if (base === "focus") return sub ? `now/${sub}` : "now";
    if (base === "ongoing" || base === "watching" || base === "automations") return sub === "running" ? "now/working" : "now/waiting";
    if (base === "running") return "now/working";
    return "now";
  }

  // src/web/app/control/ui.ts
  var say2 = (t, toast = true) => {
    if (t) current().say(t, toast);
  };
  var focusOn = (id) => document.getElementById(id)?.focus();
  var setTheme = (t) => {
    applyTheme(t);
    current().theme(t);
  };

  // src/web/app/control/switch.ts
  var KEY = "delegate-ui";
  function cached() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) ?? "null");
      return c && (c.ui === "new" || c.ui === "classic") ? c : void 0;
    } catch {
      return void 0;
    }
  }
  var cache = (ui) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ui, at: (/* @__PURE__ */ new Date()).toISOString() }));
    } catch {
    }
  };
  var save = async (ui) => {
    const r = await env.io?.ui?.({ ui }).catch(() => void 0);
    if (r?.ok && ui !== "react") cache(ui);
    return !!r?.ok;
  };
  async function chooseUi() {
    if (env.panel) return { ui: env.ui = pickUi(V, "", void 0, env.snap) };
    const h = env.snap ? void 0 : hashUi(location.hash);
    if (h) {
      history.replaceState(null, "", location.pathname + location.search);
      if (await save(h)) return { ui: env.ui = h };
      return { ui: env.ui = pickUi(V, "", cached(), env.snap), failed: true };
    }
    return { ui: env.ui = pickUi(V, "", cached(), env.snap) };
  }
  function unsent() {
    for (const [code, u] of Object.entries(S.ui)) {
      const c = cardOf(code), draft = (c && "draft" in c ? c.draft?.text?.trim() : "") ?? "";
      if (u.answer?.trim() || u.other?.trim() || u.ask?.trim() || u.marknote?.trim() || u.editing && (u.text ?? "").trim() && (u.text ?? "").trim() !== draft) return true;
    }
    if (Object.keys(S.set).length || S.form?.text?.trim() || S.wform?.text?.trim()) return true;
    return [...document.querySelectorAll("#main textarea, #main input")].some((el) => !/^(checkbox|radio|hidden|submit|button)$/.test(el.type) && !!el.value.trim() && el.value !== el.defaultValue);
  }
  async function switchUi(to) {
    if (env.panel) return;
    if (unsent() && !window.confirm("Discard your edit?")) {
      render2();
      return;
    }
    if (!await save(to)) {
      say2("Could not switch: offline");
      render2();
      return;
    }
    const base = S.route.split("/")[0];
    history.replaceState(null, "", location.pathname + location.search + (base === "done" || base === "settings" || base === "numbers" ? location.hash : ""));
    location.reload();
  }
  function closeNote() {
    V.ui = { ...V.ui ?? { ui: env.ui }, noted: true };
    void env.io?.ui?.({ noted: true }).catch(() => void 0);
    render2();
  }

  // src/web/app/model/numbers.ts
  var SMALL = 10;
  var WINDOWS = ["this", "last", "4w", "all"];
  var WINDOW_LABEL = { this: "This week", last: "Last week", "4w": "Last 4 weeks", all: "Since you started" };
  var WHEN = { this: "this week", last: "last week", "4w": "in the last 4 weeks", all: "since you started" };
  var PRIOR = { this: "last week", last: "the week before", "4w": "the 4 weeks before" };
  var FIRST_WEEK = "Your first week. Trends start next week.";
  var RULES = (name) => ({
    handled: `An ask counts once, in the week it first closed with at most one approval of unedited work: a reply sent exactly as ${name} drafted it (your ok, a picked option, or a rule), proposed changes applied with none removed, or a job's "Nothing needed". It leaves the count if, within 7 days, the reply is undone or marked wrong, incomplete, or unneeded, you say it needed you, or a missed message turns out to be part of it.`,
    bars: "One bar per week, Monday to Sunday, counted as Handled for you. A hatched bar had days when no machine was reading your chats, so a quiet week is not mistaken for a good one. Weeks before you started are dotted.",
    check: "An item stays in its 7-day check for 7 days after it counted. A correction in that time takes it out, so past weeks can still go down.",
    replies: `Replies that went out exactly as ${name} drafted them, out of every reply to an ask ${name} found: sent as drafted, edited before sending, or typed by you in Teams (each item once). Holding replies are left out.`,
    missed: `Asks you had to point at with "missed", or move from Catch up to Needs me, out of every ask: items made (not watches, and not messages that needed no reply) and the messages you pointed at. Each counts once.`,
    wait: "From when the ask was sent to the first reply in that thread, yours or a draft you sent, for asks that needed you. The middle value (median), the shortest, and the longest. Measured from message times; nothing is estimated.",
    corrections: "Items you corrected (undone, or marked wrong, incomplete, or unneeded), each once, per 100 replies sent in the last 4 weeks. Holding replies, which say the answer is coming, are not counted as sent. Keep it under 2.",
    unknown: "A reply sent before sends recorded whether they were edited, whose words were cleared after 30 days, cannot be checked. It counts as neither drafted nor edited.",
    promises: "Your dated promises closed or updated by their date, out of those due. It starts once work records its due dates."
  });
  var share = (n, of, pct) => of >= SMALL && pct !== void 0 ? `${n} of ${of} (${pct}%)` : `${n} of ${of}`;
  var brief = (n, of, pct) => of >= SMALL && pct !== void 0 ? `${pct}%` : `${n} of ${of}`;
  var dur = (min) => min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var md = (day2) => `${MONTHS[Number(day2.slice(5, 7)) - 1]} ${Number(day2.slice(8, 10))}`;
  var dmd = (day2) => `${DAYS[(/* @__PURE__ */ new Date(`${day2}T00:00:00Z`)).getUTCDay()]} ${md(day2)}`;
  var addDays = (day2, n) => new Date(Date.parse(`${day2}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  var s = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  var L = (text2, key, n) => n > 0 ? { text: text2, key } : { text: text2 };
  function listsOf(d) {
    const w = WHEN[d.window.key], h = d.handled, r = d.now.replies, m = d.now.missed, f = d.four;
    const one = (title, codes) => ({ title, groups: [{ codes }] });
    const replies = (x) => [{ title: "As drafted", codes: x.drafted }, { title: "Edited before sending", codes: x.edited }, { title: "You typed in Teams", codes: x.teams }];
    const missed2 = (x) => [{ title: "You pointed at", codes: x.pointed }, { title: "Moved to Needs me", codes: x.mine }];
    return {
      handled: one(`Handled for you ${w}`, h.codes),
      reply: one(`Replies as drafted, handled ${w}`, h.reply),
      changes: one(`Applied as proposed, handled ${w}`, h.changes),
      nothing: one(`"Nothing needed", handled ${w}`, h.nothing),
      check: one("Still in their 7-day check", h.provisional),
      ...Object.fromEntries(d.bars.map((b) => [`week:${b.week}`, one(`Handled in the week of ${md(b.week)}`, b.codes)])),
      replies: { title: `Replies to asks ${w}`, groups: replies(r) },
      drafted: one(`Replies as drafted ${w}`, r.drafted),
      edited: one(`Replies edited before sending ${w}`, r.edited),
      teams: one(`Replies you typed in Teams ${w}`, r.teams),
      unknown: one(`Sends that can no longer be checked, ${w}`, r.unknown),
      "four-replies": { title: "Replies to asks in the last 4 weeks", groups: replies(f.replies) },
      missed: { title: `Missed ${w}`, groups: missed2(m) },
      pointed: one(`Messages you pointed at ${w}`, m.pointed),
      mine: one(`Moved to Needs me ${w}`, m.mine),
      asks: one(`Every ask ${w}`, m.asks),
      "four-missed": { title: "Missed in the last 4 weeks", groups: missed2(f.missed) },
      wait: one(`Timed replies ${w}, shortest wait first`, d.now.wait.codes),
      "four-wait": one("Timed replies in the last 4 weeks, shortest wait first", f.wait.codes),
      corrections: one("Corrected in the last 4 weeks", d.corrections.codes),
      sends: one("Sent in the last 4 weeks", d.corrections.sent)
    };
  }
  function trendOf(d) {
    const h = d.handled, prior = PRIOR[d.window.key];
    if (d.firstWeek) return { text: FIRST_WEEK };
    if (!prior || h.before === void 0) return void 0;
    const span = d.window.key === "this" ? d.bars.slice(6, 7) : d.window.key === "last" ? d.bars.slice(5, 6) : d.bars.slice(0, 4);
    if (span.length && span.every((b) => b.before)) return void 0;
    if (h.arrow && h.n >= SMALL && h.before >= SMALL) {
      if (h.n > h.before) return { text: `▲ ${h.n - h.before} more than ${prior} (${h.before})`, dir: "up" };
      if (h.n < h.before) return { text: `▼ ${h.before - h.n} fewer than ${prior} (${h.before})`, dir: "down" };
      return { text: `The same as ${prior} (${h.before})`, dir: "same" };
    }
    return { text: `${prior[0].toUpperCase()}${prior.slice(1)}: ${h.before}` };
  }
  function barsOf(d) {
    const top = Math.max(1, ...d.bars.map((b) => b.n));
    return d.bars.map((b, i) => {
      const now = i === d.bars.length - 1;
      const alt = [`Week of ${md(b.week)}: ${b.before ? "before you started" : `${s(b.n, "handled", "handled")}${now ? " so far" : ""}`}`, ...b.gaps.length ? [`no machine was reading on ${b.gaps.map(dmd).join(", ")}`] : []].join("; ");
      return { week: b.week, label: md(b.week), n: b.n, height: b.before ? 0 : Math.round(b.n / top * 100), gaps: b.gaps, days: Array.from({ length: 7 }, (_, k) => b.gaps.includes(addDays(b.week, k))), before: b.before, now, alt, ...b.n > 0 ? { key: `week:${b.week}` } : {} };
    });
  }
  function numbersModel(d, name) {
    const w = WHEN[d.window.key], h = d.handled, r = d.now.replies, m = d.now.missed, t = d.now.wait, f = d.four, c = d.corrections;
    const gaps = d.bars.flatMap((b) => b.gaps);
    const repliesCard = {
      rule: "replies",
      title: "Replies as drafted",
      main: r.of ? L(`${share(r.n, r.of, r.pct)} ${w}`, "replies", r.of) : { text: `No replies to asks ${w}` },
      // A share bar only from 10: below that it would be a percentage in pictures.
      ...r.of >= SMALL ? { meter: { n: r.n, of: r.of } } : {},
      lines: [[L(`${r.drafted.length} as drafted`, "drafted", r.drafted.length), L(`${r.edited.length} edited`, "edited", r.edited.length)], [L(`${r.teams.length} you typed in Teams`, "teams", r.teams.length)]],
      four: L(`4 weeks: ${f.replies.of ? brief(f.replies.n, f.replies.of, f.replies.pct) : "none yet"}`, "four-replies", f.replies.of)
    };
    const missedCard = {
      rule: "missed",
      title: "Missed",
      main: m.of ? L(`${share(m.n, m.of, m.pct)} asks`, "missed", m.n) : { text: `No asks ${w}` },
      lines: [[L(`you pointed at ${m.pointed.length}`, "pointed", m.pointed.length)], [L(`moved ${m.mine.length} to Needs me`, "mine", m.mine.length)], [L(s(m.of, "ask", "asks") + " in all", "asks", m.of)]],
      four: L(`4 weeks: ${f.missed.of ? brief(f.missed.n, f.missed.of, f.missed.pct) : "none yet"}`, "four-missed", f.missed.n)
    };
    const waitCard = {
      rule: "wait",
      title: "Asker wait",
      main: t.median !== void 0 ? L(`median ${dur(t.median)}`, "wait", t.n) : { text: "No timed replies yet" },
      lines: [[{ text: "from ask to first reply" }], ...t.median !== void 0 ? [[{ text: `range ${dur(t.min)} to ${dur(t.max)}` }], [L(s(t.n, "timed reply", "timed replies"), "wait", t.n)]] : []],
      four: L(`4 weeks: ${f.wait.median !== void 0 ? dur(f.wait.median) : "none timed yet"}`, "four-wait", f.wait.n)
    };
    const per = c.per100 !== void 0 && c.sends >= SMALL;
    const model = {
      window: { key: d.window.key, label: d.window.label },
      handled: {
        main: L(`${s(h.n, "ask", "asks")} ${w}`, "handled", h.n),
        trend: trendOf(d),
        kinds: [L(s(h.reply.length, "reply as drafted", "replies as drafted"), "reply", h.reply.length), L(`${h.changes.length} applied as proposed`, "changes", h.changes.length), L(`${h.nothing.length} "nothing needed"`, "nothing", h.nothing.length)],
        ...h.provisional.length ? { check: L(`${h.provisional.length} still in ${h.provisional.length === 1 ? "its" : "their"} 7-day check`, "check", h.provisional.length) } : {},
        ...h.n ? { all: L(`See all ${h.n}`, "handled", h.n) } : {}
      },
      bars: barsOf(d),
      ...gaps.length ? { gapNote: `Hatched: no machine was reading on ${gaps.map(md).join(", ")}` } : {},
      cards: [repliesCard, missedCard, waitCard],
      ...r.unknown.length ? { unknown: L(`${s(r.unknown.length, "send is", "sends are")} too old to check, so ${r.unknown.length === 1 ? "it is" : "they are"} left out`, "unknown", r.unknown.length) } : {},
      corrections: per ? [L(`${c.per100} per 100 sends`, "corrections", c.n), { text: " over 4 weeks (" }, L(`${c.n} of ${c.sends}`, "sends", c.sends), { text: "; keep it under 2)" }] : [L(s(c.n, "correction", "corrections"), "corrections", c.n), { text: " in " }, L(s(c.sends, "send", "sends"), "sends", c.sends), { text: " over 4 weeks (keep it under 2 per 100)" }],
      promises: "Promises kept on time: starts once work records its due dates.",
      summary: ""
    };
    model.summary = summaryOf(d, model, name);
    return model;
  }
  function summaryOf(d, m, name) {
    const h = d.handled, r = d.now.replies, x = d.now.missed, t = d.now.wait, f = d.four;
    return [
      `${name} numbers · ${d.window.label}`,
      `Handled for you: ${h.n}${m.handled.trend ? ` · ${m.handled.trend.text}` : ""}`,
      `  ${m.handled.kinds.map((k) => k.text).join(" · ")}${m.handled.check ? ` · ${m.handled.check.text}` : ""}`,
      `  Last 8 weeks: ${d.bars.map((b) => b.before ? "-" : String(b.n)).join(", ")}`,
      `Replies as drafted: ${r.of ? share(r.n, r.of, r.pct) : "none yet"} · 4 weeks: ${f.replies.of ? brief(f.replies.n, f.replies.of, f.replies.pct) : "none yet"}`,
      ...r.unknown.length ? [`  ${r.unknown.length} left out as too old to check`] : [],
      `Missed: ${x.of ? `${share(x.n, x.of, x.pct)} asks` : "no asks"} · 4 weeks: ${f.missed.of ? brief(f.missed.n, f.missed.of, f.missed.pct) : "none yet"}`,
      `Asker wait: ${t.median !== void 0 ? `median ${dur(t.median)}, ${dur(t.min)} to ${dur(t.max)}` : "none timed yet"} · 4 weeks: ${f.wait.median !== void 0 ? dur(f.wait.median) : "none timed yet"}`,
      `Corrections: ${m.corrections.map((l) => l.text).join("")}`
    ].join("\n");
  }

  // src/web/app/state/numbers.ts
  var draw = () => S.route.split("/")[0] === "numbers" ? hooks.render() : hooks.renderSoon();
  var hasNumbers = () => !!env.io?.numbers;
  async function loadNumbers(win = S.num.win) {
    const io = env.io;
    if (!io?.numbers) return;
    const seq = ++S.num.seq;
    if (win !== S.num.win) S.num.data = void 0;
    Object.assign(S.num, { win, busy: true, failed: false });
    draw();
    try {
      const d = await io.numbers(win);
      if (seq !== S.num.seq) return;
      Object.assign(S.num, { data: d, busy: false });
    } catch {
      if (seq !== S.num.seq) return;
      Object.assign(S.num, { busy: false, failed: true });
    }
    draw();
  }
  function copySummary() {
    const d = S.num.data;
    if (!d) return;
    const text2 = numbersModel(d, env.name).summary;
    const failed = () => hooks.say('Could not copy. Open "See what is copied" and copy it yourself.', false);
    try {
      const p = navigator.clipboard?.writeText(text2);
      if (p) p.then(() => hooks.say("Summary copied: numbers only, no names and no message text."), failed);
      else failed();
    } catch {
      failed();
    }
  }

  // src/web/app/control/route.ts
  function route() {
    const ui = env.snap || env.panel ? void 0 : hashUi(location.hash);
    if (ui) {
      history.replaceState(null, "", location.pathname + location.search);
      if (ui !== env.ui) {
        void switchUi(ui);
        return;
      }
    }
    const h0 = decodeURIComponent(location.hash.slice(1)) || "home", h = current().alias?.(h0) ?? h0, was = S.route.split("/")[0];
    S.route = h.startsWith("focus") ? "focus" : { running: "ongoing/running", watching: "ongoing", automations: "ongoing/automations", "automations/new": "ongoing" }[h] || h;
    if (!S.route.startsWith("done")) S.seenFor = null;
    if (S.route.split("/")[0] === "numbers" && was !== "numbers") void loadNumbers();
    if (!S.route.startsWith("now")) S.nowLook = null;
    if (h === "automations/new") S.sheet = "pick";
    if (S.route === "focus") {
      const code = h.split("/")[1] || S.cur || openCards()[0]?.code;
      if (code && cardOf(code)) return go(code);
    }
    const sub = S.route.startsWith("settings/") && S.route.split("/")[1], row4 = sub ? V.settings?.rows.find((r) => r.key === sub) : void 0;
    if (row4?.advanced) S.advOpen = true;
    viewing();
    render2(S.route === "focus");
    const at = S.route.startsWith("numbers/") ? document.getElementById("num-list") : S.route.startsWith("ongoing/") ? document.getElementById(S.route.split("/")[1]) : S.route.startsWith("now/") ? document.getElementById(`now-${S.route.split("/")[1]}`) : row4 ? document.querySelector(`[data-code="set:${row4.key}"]`) : sub && document.getElementById(`setsec-${sub}`);
    if (at) {
      at.scrollIntoView();
      const f = row4 && document.getElementById(`set-${row4.key}`);
      if (f && f.tagName !== "SELECT") f.focus({ preventScroll: true });
    } else if (S.route !== "focus") window.scrollTo(0, 0);
  }

  // src/web/app/control/clicks.ts
  function onClick(e) {
    const target = e.target;
    const same = target.closest?.('a[href^="#settings/"]');
    if (same && same.getAttribute("href") === location.hash) {
      e.preventDefault();
      route();
      return;
    }
    const t = target.closest("[data-act]");
    document.querySelectorAll(".menu.open").forEach((m) => {
      if (!t || !m.contains(t)) {
        const code2 = m.closest("[data-code]")?.dataset.code;
        if (code2) U(code2).menu = false;
        m.classList.remove("open");
      }
    });
    if (!t) return;
    const a = t.dataset.act, code = t.closest("[data-code]")?.dataset.code ?? "", v = t.dataset.v ?? "";
    const c = code && cardOf(code), u = code && U(code);
    switch (a) {
      case "primary":
        if (/^K/.test(code)) act(code, code, kCmd(c, U(c.code)), "finish", c.rev, "primary");
        else {
          const p = primaryOf(c, U(c.code), env.name);
          act(code, code, p.cmd, p.kind, c.rev, "primary");
        }
        break;
      case "later":
        act(code, code, `later ${code}`, "later", c.rev);
        break;
      case "dismiss":
        act(code, code, `skip ${code}`, "finish", c.rev);
        break;
      case "skipk":
        act(code, code, `skip ${code}`, "finish", c.rev);
        break;
      case "continue":
        act(code, code, `continue ${code}`, "keep", c.rev);
        break;
      // The runner answers with the reply quoted and asks for one more ok; the card keeps that answer as its result line.
      case "replyonly":
        if (c.replyOnly) act(code, code, c.replyOnly, "keep", c.rev);
        break;
      case "setswitch":
        toggleSetting(v);
        break;
      case "theme":
        setTheme(nextTheme());
        say2(`Theme: ${THEME_LABEL[theme()]}.`, false);
        break;
      case "ui":
        void switchUi(env.ui === "new" ? "classic" : "new");
        break;
      case "uinote":
        closeNote();
        break;
      // A row on Now: its existing command, on the code that placed it; ok carries what the owner saw.
      case "nact":
        act(`row:${code}`, code, v, "row", t.closest("[data-rev]")?.dataset.rev);
        break;
      case "wsby":
        S.wform.by = v;
        render2();
        break;
      case "wscreate":
        startSheetWatch();
        break;
      case "watchopen":
        openRowWatch(v);
        render2();
        focusOn(`wt-${v}`);
        break;
      case "watchcancel":
        S.watchOpen = null;
        render2();
        break;
      case "wby":
        S.watchForm.by = v;
        render2();
        break;
      case "watchgo":
        startRowWatch(v);
        break;
      case "seenall":
        seenAll();
        break;
      case "findmissed":
        findMissed();
        break;
      case "copydebug":
        navigator.clipboard?.writeText(c.debug.join("\n")).then(() => say2("Details copied."), () => say2("Could not copy. Select the lines and copy them."));
        break;
      case "teams":
        u.menu = false;
        window.open(c.teams, "_blank", "noopener");
        render2();
        break;
      // Teams cannot pre-fill a group chat's compose box from a link, so the reply goes to the clipboard and the chat opens.
      // When the owner sends it from Teams, Delegate sees their own reply and closes the item.
      case "teamsdraft": {
        u.menu = false;
        const text2 = u.editing ? u.text ?? "" : c.draft?.text ?? "";
        navigator.clipboard?.writeText(text2).then(() => say2(`Reply copied. Paste it in Teams, change it, and send. ${env.name} closes this item when it sees your reply.`), () => say2("Could not copy. Select the reply and copy it yourself.", false));
        window.open(c.teams, "_blank", "noopener");
        render2();
        break;
      }
      case "edit":
        Object.assign(u, { menu: false, editing: true, text: u.text ?? c.draft?.text ?? "" });
        render2();
        {
          const ed = document.getElementById(`ed-${code}`);
          if (ed) {
            ed.focus();
            ed.setSelectionRange(ed.value.length, ed.value.length);
          }
        }
        break;
      case "canceledit":
        Object.assign(u, { editing: false, text: null });
        render2();
        break;
      case "markopen":
        Object.assign(u, { marking: true, mark: u.mark || "wrong" });
        render2();
        focusOn(`mk-${code}`);
        break;
      case "markkind":
        u.mark = v;
        render2();
        focusOn(`mk-${code}`);
        break;
      case "checkupdate":
        checkUpdate();
        break;
      case "reportopen":
        S.reporting = true;
        render2();
        focusOn("repin");
        break;
      case "reportcancel":
        S.reporting = false;
        render2();
        break;
      case "saveset":
        saveSetting(v);
        break;
      case "markcancel":
        Object.assign(u, { marking: false, marknote: "" });
        render2();
        break;
      case "thread":
        Object.assign(u, { menu: false, threadOpen: !u.threadOpen });
        render2();
        break;
      case "menu":
        e.stopPropagation();
        u.menu = !u.menu;
        t.closest(".menu").classList.toggle("open", u.menu);
        t.setAttribute("aria-expanded", String(u.menu));
        if (u.menu) t.closest(".menu").querySelector("[role=menuitem]").focus();
        break;
      case "shownew":
        if (S.fresh[code]) replaceCard(S.fresh[code]);
        delete S.fresh[code];
        Object.assign(u, { stale: false, touched: false, status: "ready", msg: "" });
        render2();
        break;
      case "usenote": {
        const n = c.notes[+v];
        act(code, code, `${code}: Use this: ${n.a}`, "draft", c.rev);
        break;
      }
      case "askmore":
        focusOn(`askin-${code}`);
        break;
      case "prev":
        step(-1);
        break;
      case "next":
        step(1);
        break;
      case "goto":
        go(v);
        break;
      case "keys":
        current().keys.open();
        break;
      case "healthfix":
        act("health", "", V.health[0].fix.command, "row");
        break;
      case "undo":
        e.preventDefault();
        act(`row:${v}`, v, `undo ${v}`, "row");
        break;
      // data-seen: what the owner saw, for a Mark done (re-review N2 P2-C); other list buttons carry none.
      case "rowact":
        act(t.dataset.key, v.split(" ")[1], v, "row", t.dataset.seen);
        break;
      case "newauto":
        S.sheet = "pick";
        render2();
        document.querySelector(".tpl")?.focus();
        break;
      case "tpl":
        if (v === "watch") {
          S.wform = { text: "", by: "", push: false };
          S.sheet = "watch";
          S.formErr = "";
          render2();
          focusOn("ws-text");
          break;
        }
        if (v !== "remind") {
          say2('Say it in chat: "send me a summary every day at 6 pm".');
          break;
        }
        S.form = newReminder(peopleOf(V)[0]?.name ?? "");
        S.sheet = "form";
        S.formErr = "";
        render2();
        document.querySelector(".sheet [data-act=autocreate]")?.focus();
        break;
      case "tplto":
        S.form = newReminder(v);
        S.sheet = "form";
        S.formErr = "";
        render2();
        document.querySelector(".sheet [data-act=autocreate]")?.focus();
        break;
      case "to":
        S.form.to = v;
        S.form.someone = false;
        render2();
        break;
      case "someone":
        S.form.someone = !S.form.someone;
        render2();
        break;
      case "every":
        S.form.every = v;
        render2();
        break;
      case "autoback":
        S.sheet = "pick";
        render2();
        break;
      case "closesheet":
        S.sheet = null;
        render2();
        break;
      case "sheetbg":
        if (e.target === t) {
          S.sheet = null;
          render2();
        }
        break;
      case "autocreate":
        createAutomation();
        break;
      case "numretry":
        void loadNumbers();
        break;
      case "numcopy":
        copySummary();
        break;
    }
  }

  // src/web/app/control/fields.ts
  function onChange(e) {
    const t = e.target;
    if (t.hasAttribute("data-ui-choice")) {
      const choice = t.value;
      t.value = env.ui;
      if (choice === "new" || choice === "classic" || choice === "react") void switchUi(choice);
      return;
    }
    if (t.dataset.ws === "push") {
      S.wform.push = t.checked;
      return;
    }
    if (t.dataset.set) {
      S.set[t.dataset.set] = t.value;
      current().patch.unsaved(t);
      return;
    }
    if (t.dataset.every) {
      const code2 = t.dataset.every;
      act(`row:${code2}`, code2, `every ${code2}: ${t.value}`, "row");
      return;
    }
    if (t.dataset.numwin != null) {
      void loadNumbers(t.value);
      return;
    }
    if (t.dataset.f) {
      S.form[t.dataset.f] = t.value;
      render2();
      return;
    }
    if (t.dataset.result) {
      U(`result:${t.dataset.result}`).pick = [+t.value];
      render2();
      return;
    }
    const el = t.closest("[data-code]");
    if (!el) return;
    const code = el.dataset.code, c = cardOf(code), u = U(code);
    if (t.dataset.opt) {
      if (t.dataset.opt === "other") {
        Object.assign(u, { otherOn: true, touched: true });
        render2();
        focusOn(`oth-${code}`);
        return;
      }
      const n = +t.dataset.opt;
      u.otherOn = false;
      if (c.choices.multi) {
        const s2 = new Set(u.pick ?? c.picked ?? []);
        if (s2.has(n)) s2.delete(n);
        else s2.add(n);
        u.pick = [...s2];
        u.touched = true;
        render2();
        return;
      }
      u.pick = [n];
      act(code, code, `pick ${code} ${n}`, "pick", c.rev);
      return;
    }
    if (t.dataset.cmt) {
      const s2 = u.cmts ??= new Set(c.changes.map((x) => x.n));
      if (t.checked) s2.add(+t.dataset.cmt);
      else s2.delete(+t.dataset.cmt);
      u.touched = true;
      render2();
    }
    if (t.dataset.fact) {
      const k = c, s2 = u.facts ??= new Set(k.facts.map((_, i) => i + 1));
      if (t.checked) s2.add(+t.dataset.fact);
      else s2.delete(+t.dataset.fact);
      u.touched = true;
      render2();
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === "find") {
      if (e.isComposing) S.find = t.value;
      else setFind(t.value);
      return;
    }
    const enable = (act2, on) => {
      const b = document.querySelector(`[data-act=${act2}]`);
      if (b) b.disabled = !on;
    };
    if (t.dataset.ws) {
      S.wform[t.dataset.ws] = t.type === "checkbox" ? t.checked : t.value;
      enable("wscreate", !!S.wform.text.trim());
      return;
    }
    if (t.dataset.wf) {
      S.watchForm[t.dataset.wf] = t.value;
      enable("watchgo", !!S.watchForm.target.trim());
      return;
    }
    if (t.dataset.set) {
      S.set[t.dataset.set] = t.value;
      current().patch.unsaved(t);
      return;
    }
    if (t.dataset.f === "text") {
      S.form.text = t.value;
      current().patch.reminder(S.form);
      enable("autocreate", !!t.value.trim());
      return;
    }
    if (t.dataset.saw) {
      U(`result:${t.dataset.saw}`).answer = t.value;
      return;
    }
    if (t.dataset.tell) {
      U(`tell:${t.dataset.tell}`).answer = t.value;
      const b = document.querySelector(`[data-form=tell][data-code="${t.dataset.tell}"] button[type=submit]`);
      if (b) b.disabled = !t.value.trim();
      return;
    }
    const el = t.closest("[data-code]");
    if (!el || !t.dataset.input) return;
    const code = el.dataset.code, c = cardOf(code), u = U(code);
    u[t.dataset.input] = t.value;
    if (t.dataset.input === "ask" || t.dataset.input === "marknote") return;
    const p = primaryOf(c, u, env.name);
    current().patch.primary(code, p.label, !!p.disabled || u.stale || S.offline);
  }
  function onSubmit(e) {
    const f = e.target, form = f.dataset.form;
    const value = (id) => (document.getElementById(id)?.value || "").trim();
    if (form === "report") {
      e.preventDefault();
      report(value("repin"));
      return;
    }
    if (form === "missed") {
      e.preventDefault();
      missed(value("missin"));
      return;
    }
    if (form === "find") {
      e.preventDefault();
      findMissed();
      return;
    }
    if (form === "tell") {
      e.preventDefault();
      const code = f.dataset.code, u = U(`tell:${code}`), text2 = u.answer.trim();
      if (!text2) return;
      u.answer = "";
      act(`row:${code}`, code, f.dataset.cmd.replace("{text}", text2), "row");
      return;
    }
    if (form === "result") {
      e.preventDefault();
      const code = f.dataset.code, u = U(`result:${code}`), result = RESULTS[u.pick?.[0] ?? -1], saw = u.answer.replace(/\s+/g, " ").trim();
      if (!result) return;
      act(`row:${code}`, code, f.dataset.cmd.replace("{result}", () => result).replace(saw ? "{text}" : ": {text}", () => saw), "row", void 0, "", () => Object.assign(u, { pick: null, answer: "" }));
      return;
    }
    if (form === "mark") {
      e.preventDefault();
      markCard(f.closest("[data-code]").dataset.code);
      return;
    }
    if (form !== "ask") return;
    e.preventDefault();
    ask(f.closest("[data-code]").dataset.code);
  }

  // src/web/app/control/keys.ts
  var gAt = 0;
  function onKey(e) {
    const inField = field(), c = S.route === "focus" ? cardOf(S.cur ?? "") : null;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && c && !S.done.has(c.code)) {
      e.preventDefault();
      document.getElementById(`pri-${c.code}`)?.click();
      return;
    }
    if (e.key === "Escape") {
      if (current().keys.isOpen()) return;
      if (S.sheet) {
        S.sheet = null;
        render2();
        return;
      }
      const a = document.activeElement;
      if (a?.id === "find" && a.value) {
        e.preventDefault();
        setFind("");
        return;
      }
      if (inField) {
        const active = document.activeElement, card3 = active.closest("article.card");
        active.blur();
        card3?.focus({ preventScroll: true });
        return;
      }
      if (S.route === "focus") location.hash = "#home";
      return;
    }
    if (inField || e.metaKey || e.ctrlKey || e.altKey || current().keys.isOpen()) return;
    if (e.key === "?") {
      current().keys.open();
      return;
    }
    if (e.key === "/" && document.getElementById("find")) {
      e.preventDefault();
      focusOn("find");
      return;
    }
    if (e.key === "g") {
      gAt = Date.now();
      return;
    }
    if (e.key === "h" && Date.now() - gAt < 800) {
      location.hash = "#home";
      return;
    }
    if (e.key === "u") {
      const r = V.done.find((x) => x.undoUntil && Date.parse(x.undoUntil) > Date.now());
      if (r) {
        location.hash = "#done/replies";
        act(`row:${r.code}`, r.code, `undo ${r.code}`, "row");
      }
      return;
    }
    if (!c || S.done.has(c.code)) return;
    if (e.key === "j" || e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "k" || e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "l") act(c.code, c.code, `later ${c.code}`, "later", c.rev);
    else if (e.key === "a") {
      e.preventDefault();
      focusOn(`askin-${c.code}`);
    } else if (e.key === "e" && c.draft && (c.type === "reply" || c.type === "review")) {
      e.preventDefault();
      onClick({ target: document.querySelector(`#card-${c.code} [data-act=edit]`), stopPropagation() {
      }, preventDefault() {
      } });
    } else if (/^[1-9]$/.test(e.key)) {
      const n = +e.key, inp = c.choices ? document.getElementById(`o-${c.code}-${n}`) : document.getElementById(`cm-${c.code}-${n}`);
      if (inp && !inp.disabled) inp.click();
    }
  }

  // src/web/app/control/index.ts
  function listen() {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusout", () => setTimeout(() => {
      if (S.deferred && !typing()) render2();
    }, 0));
    document.addEventListener("compositionstart", () => {
      S.composing = true;
    }, true);
    document.addEventListener("compositionend", (e) => {
      S.composing = false;
      const t = e.target;
      if (t.id === "find") setFind(t.value);
      else if (S.deferred && !typing()) render2();
    }, true);
    document.addEventListener("pointerdown", (e) => {
      if (e.target.closest?.("button,[data-act]")) S.pressing = Date.now();
    }, true);
    const released = () => {
      S.pressing = 0;
      setTimeout(() => {
        if (S.deferred && !typing()) render2();
      }, 0);
    };
    document.addEventListener("pointerup", released, true);
    document.addEventListener("pointercancel", released, true);
    const remember = (d, open) => {
      const code = () => d.closest("[data-code]")?.dataset.code;
      if (d.dataset?.row != null) {
        const c = code();
        if (c) U(c).open = open;
      }
      if (d.dataset?.why != null) {
        const c = code();
        if (c) U(c).whyOpen = open;
      }
      if (d.dataset?.dbg != null) {
        const c = code();
        if (c) U(c).dbgOpen = open;
      }
      if (d.dataset?.adv != null) S.advOpen = open;
      if (d.dataset?.chan != null) S.chanOpen = open;
      if (d.dataset?.how != null) {
        if (open) S.num.how.add(d.dataset.how);
        else S.num.how.delete(d.dataset.how);
      }
    };
    document.addEventListener("click", (e) => {
      const sm = e.target?.closest?.("summary");
      const d = sm?.parentElement;
      if (d instanceof HTMLDetailsElement && sm === d.querySelector(":scope > summary")) remember(d, !d.open);
    }, true);
    document.addEventListener("toggle", (e) => remember(e.target, e.target.open), true);
    window.addEventListener("hashchange", route);
    setInterval(() => {
      document.querySelectorAll("[data-until]").forEach((el) => {
        const s2 = Math.round((Date.parse(el.dataset.until) - Date.now()) / 1e3);
        if (s2 <= 0) renderSoon2();
        else el.textContent = mmss(s2);
      });
    }, 1e3);
    poll(env.io, env.poll, { since: () => V.since, ui: () => env.ui, waiting: () => [...V.needs, ...V.done].some((c) => c.notes?.some((n) => !n.a)), got: connected, lost });
  }

  // src/web/app/view/html.ts
  var Html = class {
    s;
    constructor(s2) {
      this.s = s2;
    }
    toString() {
      return this.s;
    }
  };
  var ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var text = (s2) => String(s2 ?? "").replace(/[&<>"']/g, (c) => ENT[c]);
  var part = (v) => v instanceof Html ? v.s : Array.isArray(v) ? v.map(part).join("") : typeof v === "string" ? text(v) : String(v);
  var raw = (s2) => s2 ? new Html(s2) : "";
  var esc = (s2) => raw(text(s2));
  function html(strings, ...parts) {
    let out = strings[0];
    for (let i = 0; i < parts.length; i++) out += part(parts[i]) + strings[i + 1];
    return raw(out);
  }
  var join = (items, by) => raw(items.map(String).join(String(by)));
  var str = (h) => String(h);

  // src/web/app/view/icons.ts
  var ICONS = {
    check: '<path d="M3.5 8.5l3 3 6-7"/>',
    left: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
    right: '<path d="M6 3.5L10.5 8 6 12.5"/>',
    back: '<path d="M13 8H3.5M7.5 4L3.5 8l4 4"/>',
    arrow: '<path d="M3 8h9.5M8.5 4l4 4-4 4"/>',
    reply: '<path d="M2.5 4.5a2 2 0 012-2h7a2 2 0 012 2v5a2 2 0 01-2 2H7l-3 2.5v-2.5a1.5 1.5 0 01-1.5-1.5z"/>',
    send: '<path d="M2.5 8l11-5-4 11-2-4.5z"/><path d="M7.5 9.5l6-6.5"/>',
    spark: '<path d="M8 2l1.3 3.4L12.7 6.7 9.3 8 8 11.4 6.7 8 3.3 6.7l3.4-1.3z"/><path d="M12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
    cal: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    warn: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11.3v.2"/>',
    info: '<circle cx="8" cy="8" r="5.5"/><path d="M8 7.3v3.5M8 5.2v.2"/>',
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
    pr: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="12.5" r="1.5"/><path d="M4.5 5v6M11.5 11V6.5a2 2 0 00-2-2H7.5M9 3l-1.5 1.5L9 6"/>',
    task: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M5.5 8.2l1.8 1.8 3.3-3.8"/>',
    moon: '<path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z"/>',
    sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/>',
    auto: '<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/>',
    eye: '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
    bolt: '<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>',
    book: '<path d="M3 3.5A1.5 1.5 0 014.5 2H13v10H4.5A1.5 1.5 0 003 13.5zM3 13.5A1.5 1.5 0 004.5 15H13v-3"/>',
    more: '<circle cx="3.5" cy="8" r=".6"/><circle cx="8" cy="8" r=".6"/><circle cx="12.5" cy="8" r=".6"/>',
    edit: '<path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z"/>',
    x: '<path d="M4 4l8 8M12 4l-8 8"/>',
    undo: '<path d="M5.5 3.5L2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.5 3.5 0 010 7H7"/>',
    pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
    play: '<path d="M5 3.5v9l7-4.5z"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    later: '<path d="M3 4.5h7M3 8h5M3 11.5h4"/><path d="M11 9.5l2 2-2 2"/>',
    menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
    ext: '<path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 01-1 1h-7a1 1 0 01-1-1v-7a1 1 0 011-1h3"/>',
    pc: '<rect x="2" y="3" width="12" height="8" rx="1.2"/><path d="M5.5 13.5h5M8 11v2.5"/>',
    chat: '<path d="M2.5 7.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5-2.5 5-5.5 5c-.8 0-1.6-.1-2.3-.4L3 13.5l.7-2.4a4.7 4.7 0 01-1.2-3.6z"/>',
    sum: '<path d="M3 3.5h10M3 6.5h10M3 9.5h6M3 12.5h4"/>',
    key: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.5h.5M6.5 6.5H7M9 6.5h.5M11.5 6.5h.5M5 9.5h6"/>',
    off: '<path d="M2 2l12 12M5.5 5.6A5 5 0 003 8M8 3a8 8 0 016 3M10.5 10.4A3 3 0 008 9.5a3 3 0 00-2 .8M8 12.5h0"/>',
    logo: '<path d="M3 4.5A2 2 0 015 2.5h6a2 2 0 012 2v4a2 2 0 01-2 2H8.5L5.5 13v-2.5H5a2 2 0 01-2-2z" fill="currentColor" stroke="none"/><path d="M6 6.6l1.5 1.5L10.3 5" style="stroke:#5b5fc7;stroke-width:1.7"/>'
  };
  var sprite = raw(`<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 16 16">${v}</symbol>`).join("")}</defs></svg>`);
  var I = (id, cls = "") => raw(`<svg class="i ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`);

  // src/web/app/view/classic/parts.ts
  function B(label, act2, o = {}) {
    if (env.snap) return o.verb ? html`<span class="verb ${o.primary ? raw("primary") : ""}">${esc(o.verb)}</span>` : "";
    const cls = ["btn", o.primary && "primary", o.ghost && "ghost", o.sm && "sm", o.icon && "icon", o.cls, o.busy && "busy"].filter(Boolean).join(" ");
    const dis = o.disabled || o.busy || S.offline && o.primary;
    return html`<button class="${raw(cls)}" data-act="${raw(act2)}"${o.id ? html` id="${raw(o.id)}"` : ""}${o.v != null ? html` data-v="${esc(o.v)}"` : ""}${dis ? raw(" disabled") : ""}${o.aria ? html` ${o.aria}` : ""}>${o.busy ? raw('<span class="spin" aria-hidden="true"></span>') : ""}${o.ic ? I(o.ic) : ""}${o.icon ? html`<span class="sr">${esc(label)}</span>` : html`<span class="bl">${esc(o.busy ? o.busyLabel || label : label)}</span>`}</button>`;
  }
  var kbd = (v) => html`<kbd>${esc(v)}</kbd>`;
  var av = (w, cls = "") => html`<span class="av hue ${raw(cls)}" style="--hue:${w.hue}" aria-hidden="true">${esc(w.initials)}</span>`;
  var listHead = (title, sub, extra = "") => html`<div class="lh"><div><h1>${esc(title)}</h1>${sub ? html`<p>${esc(sub)}</p>` : ""}</div><span class="sp"></span>${extra}</div>`;
  var rowState = (key) => {
    const u = peek(key);
    return u.status === "pending" ? html`<span class="m">${esc(u.lost ? "Lost connection. Retrying…" : "Working…")}</span>` : u.msg ? html`<span class="m" role="status">${esc(u.msg)}</span>` : "";
  };
  var checkNow = () => env.snap ? "" : B("Check now", "rowact", { sm: true, v: "retry", verb: "retry", aria: raw('data-key="row:retry"') });

  // src/web/app/view/classic/sheet.ts
  var formSentence = (f) => html`${esc(EVERY[f.every])} at ${esc(clock(f.at))}, send <b>${esc(first(f.to))}</b>: “${esc(f.text)}” <span class="marker">(sent by my assistant)</span>`;
  function autoRow(a) {
    const key = `row:${a.code}`, verb = a.state === "paused" ? "resume" : a.state === "proposed" ? "ok" : "pause";
    const label = { resume: "Resume", ok: "Start", pause: "Pause" }[verb];
    return html`<li class="arow${a.state === "paused" ? raw(" paused") : ""}${S.newAuto === a.code ? raw(" new") : ""}"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2)">${I("clock")}</span>
		<div class="s">${esc(a.sentence)}<span class="m">${a.state === "paused" ? a.why ? html`Paused: ${esc(a.why)}` : esc("Paused") : a.state === "proposed" ? esc("Not started") : a.next ? html`Next: ${esc(when(a.next))}` : ""}${a.count ? html` · Sent ${esc(plural(a.count, "time"))}` : ""}</span>${rowState(key)}</div><span class="code">${esc(a.code)}</span>
		${B(label, "rowact", { sm: true, ic: verb === "pause" ? "pause" : "play", v: `${verb} ${a.code}`, verb: `${verb} ${a.code}`, aria: html`data-key="${esc(key)}"` })}${B("End", "rowact", { sm: true, ghost: true, v: `skip ${a.code}`, verb: `skip ${a.code}`, aria: html`data-key="${esc(key)}"` })}</li>`;
  }
  var TEMPLATES = [["remind", "clock", "Remind someone", "Send a person the same message on a schedule."], ["watch", "eye", "Watch something", "Make sure something gets done: a PR, an ask to someone, a decision."], ["summary", "sum", "Daily summary", 'Say it in chat: "send me a summary at 6 pm".']];
  var errLine = () => S.formErr ? html`<div class="state refused" role="alert">${I("warn")}<p>${esc(S.formErr)}</p></div>` : "";
  var pick = () => html`<div class="tpls">${TEMPLATES.map(([k, ic, t, s2]) => html`<button class="tpl" data-act="tpl" data-v="${esc(k)}"><span class="ti">${I(ic)}</span><span><b>${esc(t)}</b><span>${esc(s2)}</span></span></button>${k === "remind" && V.people.length ? html`<div class="chips" role="group" aria-label="Remind someone you talk to" style="margin:-4px 0 8px 52px">${peopleOf(V).slice(0, 4).map((p) => html`<button type="button" class="chip" data-act="tplto" data-v="${esc(p.name)}" style="display:inline-flex;gap:6px;align-items:center;padding-left:4px">${av(whoOf(p.name), "xs")}${p.group ? html`Post in ${esc(p.name)}` : html`Remind ${esc(p.name.split(" ")[0])}`}</button>`)}</div>` : ""}`)}</div>`;
  function watch() {
    const f = S.wform;
    return [
      html`<div class="frm"><div><label for="ws-text">What should I make sure gets done?</label><input class="field" id="ws-text" data-ws="text" value="${esc(f.text)}" placeholder="PR 1601234 merged, or: Ana sends the trace IDs" autocomplete="off"></div>
			<div><span class="fl">Done by</span><div class="seg" role="group" aria-label="Done by">${BY.map(([k, l]) => html`<button type="button" data-act="wsby" data-v="${esc(k)}" aria-pressed="${f.by === k}">${esc(l)}</button>`)}</div></div>
			<label class="chk"><input type="checkbox" data-ws="push"${f.push ? raw(" checked") : ""}> Push it: draft fixes and nudges as soon as they help. Nothing goes out without your ok.</label>
			${errLine()}</div>`,
      html`<div class="sheet-f"><span class="sp">${esc(env.name)} checks it, tells you when it is done, and asks you if it gets stuck.</span>${B("Back", "autoback", { ghost: true })}${B("Start watching", "wscreate", { primary: true, busy: S.formBusy, busyLabel: "Starting…", disabled: !f.text.trim() })}</div>`
    ];
  }
  function remind() {
    const f = S.form, ps = peopleOf(V), shown = ps.slice(0, 5);
    const seg = (opts) => html`<div class="seg" role="group" aria-label="How often">${opts.map(([v, l]) => html`<button type="button" data-act="every" data-v="${esc(v)}" aria-pressed="${f.every === v}">${esc(l)}</button>`)}</div>`;
    const hours = [.../* @__PURE__ */ new Set([...HOURS, f.at])].sort();
    return [
      html`<div class="frm">
			<div><span class="fl" id="to-l">Send to</span><div class="chips" role="group" aria-labelledby="to-l" style="margin:0">${shown.map((p) => html`<button type="button" class="chip" data-act="to" data-v="${esc(p.name)}" aria-pressed="${f.to === p.name}" style="display:inline-flex;gap:6px;align-items:center;padding-left:4px">${av(whoOf(p.name), "xs")}${esc(p.name)}</button>`)}${ps.length > shown.length ? html`<button type="button" class="chip" data-act="someone" aria-expanded="${f.someone}">Someone else…</button>` : ""}</div>
			${f.someone ? html`<div class="who-sel"><label class="sr" for="au-who">Person or chat</label><select class="field" id="au-who" data-f="to" style="width:100%">${ps.map((p) => html`<option${p.name === f.to ? raw(" selected") : ""}>${esc(p.name)}</option>`)}</select></div>` : ""}</div>
			<div><label for="au-text">Message</label><input class="field" id="au-text" data-f="text" value="${esc(f.text)}" autocomplete="off"></div>
			<div><span class="fl">When</span><div class="row2">${seg([["day", "Every day"], ["weekday", "Weekdays"], ["week", "Weekly"]])}<label class="sr" for="au-time">Time</label><select class="field" id="au-time" data-f="at">${hours.map((h) => html`<option value="${esc(h)}"${h === f.at ? raw(" selected") : ""}>${esc(clock(h))}</option>`)}</select></div></div>
			<div><span class="fl">${esc(env.name)} will</span><div class="prev-s" id="au-prev">${formSentence(f)}</div></div>
			${errLine()}</div>`,
      html`<div class="sheet-f"><span class="sp">You approve this text once. Pausing ${esc(env.name)} pauses it.</span>${B("Back", "autoback", { ghost: true })}${B("Create automation", "autocreate", { primary: true, busy: S.formBusy, busyLabel: "Creating…", disabled: !f.to || !f.text.trim() })}</div>`
    ];
  }
  function sheet() {
    const [body6, foot] = S.sheet === "pick" ? [pick(), ""] : S.sheet === "watch" ? watch() : remind();
    return html`<div class="sheet-bg" data-act="sheetbg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-h"><div class="sheet-h"><h2 id="sh-h">${esc(S.sheet === "pick" ? "New automation" : S.sheet === "watch" ? "Watch something" : "Remind someone")}</h2><span class="steps">${esc(S.sheet === "pick" ? "Step 1 of 2" : "Step 2 of 2")}</span>${B("Close", "closesheet", { ghost: true, sm: true, icon: true, ic: "x" })}</div><div class="sheet-b">${body6}</div>${foot}</div></div>`;
  }

  // src/web/app/view/classic/cards/blocks.ts
  function draftBlock(c, u, label = c.draft?.holding ? "Holding reply" : "Your reply") {
    if (!c.draft) return "";
    const canEdit = !env.snap && (c.type === "reply" || c.type === "review");
    const head2 = html`<div class="lbl-row"><span>${esc(label)}</span><span class="sp"></span>${canEdit && !u.editing ? html`<button class="btn ghost sm" data-act="edit">${I("edit", "sm")}Edit</button>` : ""}</div>`;
    const body6 = u.editing ? html`<label class="sr" for="ed-${esc(c.code)}">Edit your reply</label><textarea class="edit" id="ed-${esc(c.code)}" data-input="text">${esc(u.text ?? c.draft.text)}</textarea>` : html`<div class="draft">${esc(c.draft.text)}</div>`;
    const note = c.draft.preview ? html`<p class="draft-note">${I("spark", "sm")}${esc(c.picked?.length ? "The reply for your pick" : "New draft from your answer")}. Not sent yet.</p>` : "";
    const commit = c.draft.commitment ? html`<p class="commit">${I("info", "sm")}This reply commits you to something. Check the date or promise.</p>` : "";
    const hold = c.draft.holding ? html`<p class="commit">${I("info", "sm")}Not the answer: the work did not finish. It only tells them you are on it.</p>` : "";
    return html`${head2}${body6}${note}${commit}${hold}`;
  }
  var ctx = (c) => c.context?.length ? html`<ul class="ctx">${c.context.map((f) => html`<li class="${f.tone === "warn" ? raw("warn") : ""}">${I(f.tone === "warn" ? "warn" : "info", "sm")}<span>${f.label ? html`<b>${esc(f.label)}:</b> ` : ""}${esc(f.text)}</span></li>`)}</ul>` : "";
  function options(c, u) {
    const ch = c.choices, multi = !!ch.multi, nm = `o-${c.code}`;
    const sel = u.pick ?? c.picked ?? [];
    const rows2 = ch.options.map((o, i) => {
      const n = i + 1, on = sel.includes(n) && !u.otherOn, warn = /conflict/i.test(o.note || "");
      return html`<label class="opt ${multi ? raw("multi") : ""}"><input type="${raw(multi ? "checkbox" : "radio")}" name="${esc(nm)}" id="${esc(nm)}-${n}" data-opt="${n}"${on ? raw(" checked") : ""}${env.snap || u.status === "pending" ? raw(" disabled") : ""}><span class="mk">${I("check")}</span>
			<span class="ol"><b>${esc(o.label)}</b>${o.note ? html`<span class="${warn ? raw("warn") : ""}">${warn ? html`${I("warn", "sm")} ` : ""}${esc(o.note)}</span>` : ""}</span><span class="k" aria-hidden="true">${n}</span></label>`;
    });
    const other = ch.other !== false && !env.snap ? html`<label class="opt"><input type="radio" name="${esc(nm)}" id="${esc(nm)}-o" data-opt="other"${u.otherOn ? raw(" checked") : ""}><span class="mk"></span><span class="ol"><b>Other answer…</b><span>Say it in your words. ${esc(env.name)} drafts the reply.</span></span></label>` : "";
    const field2 = u.otherOn ? html`<div style="margin-top:10px"><label class="sr" for="oth-${esc(c.code)}">Your answer</label><input class="field" id="oth-${esc(c.code)}" data-input="other" placeholder="Say it in your words" value="${esc(u.other)}" autocomplete="off"></div>` : "";
    return html`<fieldset class="opts"><legend class="sr">${esc(ch.prompt || c.question || "Options")}</legend>${rows2}${other}</fieldset>${field2}`;
  }
  function meetingStrip(c) {
    const m = c.meeting, s2 = new Date(m.start), e = new Date(s2.getTime() + m.minutes * 6e4);
    const day2 = Math.round((new Date(s2.getFullYear(), s2.getMonth(), s2.getDate()).getTime() - new Date((/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0)).getTime()) / 864e5);
    const dl = day2 === 0 ? "Today" : day2 === 1 ? "Tomorrow" : s2.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    return html`<div class="mtg"><span class="cal" aria-hidden="true"><small>${esc(s2.toLocaleDateString([], { month: "short" }))}</small><b>${s2.getDate()}</b></span><div class="mt"><b>${esc(m.subject)}</b><span>${esc(dl)} ${esc(time(s2))} to ${esc(time(e))}</span></div><span class="stack">${m.attendees.slice(0, 3).map((a) => av(whoOf(a), "sm"))}</span></div>`;
  }
  var meaningLine = (m) => m?.length ? html`<p class="mean">${join(m.map((p) => p.warn ? html`<span class="warn">${I("warn", "sm")}${esc(p.text)}</span>` : esc(p.text)), raw(" · "))}</p>` : "";
  var alsoLine = (c, ic) => !c.changes.length ? "" : c.changes.some((x) => x.meaning) ? html`<div class="also-line">${I(ic, "sm")}<div><b>Also:</b><ul class="also-list">${c.changes.map((x) => html`<li>${esc(x.summary)}${meaningLine(x.meaning)}</li>`)}</ul></div></div>` : html`<p class="also-line">${I(ic, "sm")}<span><b>Also:</b> ${esc(c.changes.map((x) => x.summary).join("; "))}</span></p>`;
  var preview = (c, u) => c.draft?.preview && !u.otherOn ? html`<div class="preview">${draftBlock(c, u)}${alsoLine(c, c.type === "meeting" ? "cal" : "task")}</div>` : "";
  var saidLine = (c) => c.promise ? html`<p class="also-line">${I("reply", "sm")}<span><b>You said:</b> "${esc(c.promise.said)}"</span></p>${c.promise.failed !== void 0 ? html`<p class="q">Sent. Could not check what your reply promised: ${esc(c.promise.failed)}</p>` : ""}` : "";
  var promiseLines = (c) => html`${c.todos?.length ? html`<p class="also-line">${I("warn", "sm")}<span><b>Yours to do:</b> ${esc(c.todos.join("; "))}</span></p>` : ""}${c.follow ? html`<p class="also-line">${I("eye", "sm")}<span><b>Then:</b> watch ${esc(c.follow.target)} every ${c.follow.everyHours} h until ${esc(c.follow.until)}, for up to 7 days. Change it under Watching.</span></p>` : ""}`;

  // src/web/app/view/classic/cards/choice.ts
  var body = (c, u) => html`<p class="q">${esc(forPage(c.choices.prompt || c.question))}</p>${ctx(c)}${options(c, u)}${preview(c, u)}`;

  // src/web/app/view/classic/cards/meeting.ts
  var body2 = (c, u) => html`${meetingStrip(c)}${c.question || c.choices?.prompt ? html`<p class="q">${esc(c.question || c.choices.prompt)}</p>` : ""}${ctx(c)}${c.choices ? options(c, u) : ""}${preview(c, u)}`;

  // src/web/app/view/classic/cards/question.ts
  var body3 = (c, u) => html`<p class="q">${esc(forPage(c.question))}</p>${ctx(c)}<label class="sr" for="ans-${esc(c.code)}">Your answer</label><input class="field" id="ans-${esc(c.code)}" data-input="answer" placeholder="Your answer" value="${esc(u.answer)}" autocomplete="off">`;

  // src/web/app/view/classic/cards/reply.ts
  var body4 = (c, u) => html`${saidLine(c)}${c.question && !c.draft?.preview ? html`<p class="q">${esc(forPage(c.question))}</p>` : ""}${ctx(c)}${draftBlock(c, u)}${alsoLine(c, "task")}${promiseLines(c)}`;

  // src/web/app/view/classic/cards/review.ts
  function body5(c, u) {
    const on = u.cmts ?? new Set(c.changes.map((x) => x.n));
    return html`${saidLine(c)}${c.question ? html`<p class="q">${esc(forPage(c.question))}</p>` : ""}${c.job && !c.promise ? html`<p class="rv-sum">${I("pr", "sm")}<b>${esc(c.job)}</b><span>· ${esc(plural(c.changes.length, "finding"))}</span></p>` : ""}
			<div class="lbl-row"><span>Changes to make</span><span class="sp"></span><span style="text-transform:none;letter-spacing:0;font-weight:500">${on.size} of ${c.changes.length} selected</span></div>
			<ul class="cmts">${c.changes.map((x) => html`<li><label class="cmt"><input type="checkbox" id="cm-${esc(c.code)}-${x.n}" data-cmt="${x.n}"${on.has(x.n) ? raw(" checked") : ""}${env.snap ? raw(" disabled") : ""}><span class="mk">${I("check")}</span><span class="cb"><span class="loc">${esc(x.target)}<span class="tag">${esc(x.system)}</span></span><p>${esc(x.summary)}</p>${meaningLine(x.meaning)}${x.detail ? html`<pre>${esc(x.detail)}</pre>` : ""}</span></label></li>`)}</ul>${draftBlock(c, u)}`;
  }

  // src/web/app/view/classic/cards/index.ts
  var BODY = { reply: body4, question: body3, choice: body, meeting: body2, review: body5 };
  var bodyOf = (c, u) => (BODY[c.type] || BODY.reply)(c, u);

  // src/web/app/view/classic/card.ts
  var primary = (c) => primaryOf(c, U(c.code), env.name);
  function why(c, u) {
    const w = c.why, n = w.sources.length;
    const sr = w.searched ?? [];
    if (!w.reason && !n && !w.gaps.length && !sr.length) return "";
    const rows2 = w.sources.map((s2) => html`<div class="src"><span class="k">${esc(s2.kind)}</span><span>${s2.href && !env.snap ? html`<a href="${esc(s2.href)}" target="_blank" rel="noopener">${esc(s2.label)}</a>` : esc(s2.label)}</span><span class="x">${s2.stale ? raw('<span class="tag warn">May be out of date</span>') : ""}${s2.locked ? html`${I("lock", "sm")}Not visible to ${esc(first(c.who.name))}` : s2.kind === "In the chat" ? html`Visible to ${esc(first(c.who.name))}` : ""}</span></div>`);
    const looked = sr.length ? html`<div class="src"><span class="k">Looked up</span><span>${join(sr.map((x) => esc(x)), raw("<br>"))}</span></div>` : "";
    const gaps = w.gaps.length ? html`<div class="src"><span class="k">Could not read</span><span>${esc(w.gaps.join(", "))}</span></div>` : "";
    const conf = w.confidence ? html`<span class="tag">${esc(w.confidence[0].toUpperCase() + w.confidence.slice(1))} confidence</span>` : "";
    return html`<div class="c-sec" style="padding-top:12px;padding-bottom:12px"><details class="why" data-why${u.whyOpen ? raw(" open") : ""}><summary>${I("right", "sm chev")}<span class="rs"><b>Why:</b> ${esc(w.reason || "The sources behind this draft")}</span>${conf}${n ? html`<span class="tag">${esc(plural(n, "source"))}</span>` : ""}</summary><div class="why-b">${rows2}${looked}${gaps}</div></details></div>`;
  }
  function menu(c, u) {
    if (env.snap) return "";
    const canEdit = c.draft && (c.type === "reply" || c.type === "review");
    return html`<div class="menu${u.menu ? raw(" open") : ""}"><button class="btn ghost sm icon" data-act="menu" aria-haspopup="menu" aria-expanded="${u.menu}" aria-label="More actions for ${esc(c.code)}">${I("more")}</button><div class="menu-pop" role="menu">
		${canEdit ? html`<button role="menuitem" data-act="edit">${I("edit")}Edit reply<small>e</small></button>` : ""}
		<button role="menuitem" data-act="later">${I("later")}Later<small>l</small></button>
		<button role="menuitem" data-act="thread">${I("chat")}${esc(u.threadOpen ? "Hide" : "Show")} thread</button>
		${c.teams && c.draft ? html`<button role="menuitem" data-act="teamsdraft">${I("edit")}Edit in Teams<small>copies the reply</small></button>` : ""}
		${c.teams ? html`<button role="menuitem" data-act="teams">${I("ext")}Open in Teams</button>` : ""}
		<button role="menuitem" data-act="continue">${I("pc")}Open on your computer</button>
		<hr><button role="menuitem" data-act="dismiss">${I("x")}Dismiss</button></div></div>`;
  }
  function head(c, u) {
    return html`<div class="c-head">${av(c.who)}<div class="c-who"><h2 class="c-name" id="h-${esc(c.code)}">${esc(c.who.name)}</h2>
		<div class="c-meta">${I(c.chat.group ? "chat" : "reply", "sm")}<span>${esc(c.chat.name)}</span>${c.chat.guests ? raw('<span class="tag warn">Guests</span>') : ""}<span aria-hidden="true">·</span><span>${esc(when(c.at))}</span></div></div>
		<div class="c-right">${c.before ? html`<span class="tag" title="Sent before you set up ${esc(env.name)}; replies wait for your ok">From before setup · ${esc(when(c.before))}</span>` : ""}${c.newCount ? html`<span class="tag warn">${c.newCount} new</span>` : ""}<span class="code">${esc(c.code)}</span>${menu(c, u)}</div></div>
		${c.earlier ? html`<p class="earlier">${I("clock", "sm")}${esc(c.earlier)}</p>` : ""}`;
  }
  function askBlock(c, u) {
    if (!c.ask) return "";
    const th = c.thread.length ? c.thread : [{ who: c.who.name, text: c.ask, at: c.at }];
    return html`<div class="ask">${esc(c.ask)}${env.snap ? "" : html`<button class="link tl" data-act="thread" aria-expanded="${u.threadOpen}">${esc(u.threadOpen ? "Hide thread" : "Show thread")}</button>`}</div>
		${u.threadOpen ? html`<ol class="thread" aria-label="Thread">${th.map((m) => html`<li><b>${esc(m.who)}</b><time>${esc(when(m.at))}</time><div>${esc(m.text)}</div></li>`)}</ol>` : ""}`;
  }
  function stateLine(u, verb) {
    if (u.status === "pending") return u.lost ? html`<div class="state lost" role="status">${I("off")}<p><b>Lost connection. Retrying…</b> ${esc(env.name)} has your action. It will not be sent twice.</p></div>` : html`<div class="state pending" role="status"><span class="spin" aria-hidden="true"></span><p>${esc(doing(verb, env.name))} Usually under a minute. You can move on.</p></div>`;
    if (u.status === "refused") {
      const r = refusalOf(u.msg);
      return html`<div class="state ${raw(r.cls)}" role="alert">${I(r.cls === "check" ? "info" : "warn")}<p><b>${esc(r.label)}</b> ${esc(forPage(u.msg))}</p></div>`;
    }
    if (u.msg) return html`<div class="state ${raw(u.lost ? "lost" : "info")}" role="status">${I(u.lost ? "off" : "info")}<p>${esc(forPage(u.msg))}</p></div>`;
    return "";
  }
  function actions(c, u) {
    const p = primary(c), verb = p.verb || p.cmd;
    const pending = u.status === "pending" && (u.by === "primary" || u.verb === verb);
    const busyLabel = /^pick\b/i.test(u.verb || "") && u.by !== "primary" ? "Preparing…" : p.kind === "draft" ? "Drafting…" : /^(Post|Make|Approve|Reject|Check)\b/.test(p.label) ? `${p.label.split(" and ")[0].replace(/^Post/, "Posting").replace(/^Make/, "Making").replace(/^Approve/, "Approving").replace(/^Reject/, "Rejecting").replace(/^Check/, "Checking")}…` : "Sending…";
    const only = c.replyOnly && !u.editing ? B("Send reply only", "replyonly", { verb: c.replyOnly, busy: u.status === "pending" && u.verb === c.replyOnly, busyLabel: "Checking…" }) : "";
    const sec = [u.editing ? B("Cancel edit", "canceledit", { cls: "sec-hide" }) : "", only, B("Later", "later", { ghost: true, verb: `later ${c.code}` })];
    const foot = env.snap ? "" : p.hint ? html`<p class="vh">${esc(p.hint)}</p>` : "";
    return html`${stateLine(u, u.verb || verb)}<div class="acts">${B(p.label, "primary", { primary: true, id: `pri-${c.code}`, disabled: p.disabled || u.stale, busy: pending, busyLabel, verb })}${sec}</div>${foot}`;
  }
  function noteHtml(c, n, i) {
    if (!n.a) return html`<li class="nq">${esc(n.q)}</li><li class="na"><span class="bot" aria-hidden="true">${I("spark", "sm")}</span><div class="nb"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="wait"> ${esc(env.name)} is looking into it.</span></div></li>`;
    return html`<li class="nq">${esc(n.q)}</li><li class="na"><span class="bot" aria-hidden="true">${I("spark", "sm")}</span><div class="nb"><span class="sr">${esc(env.name)}:</span><p>${esc(n.a)}</p>
		${n.sources?.length ? html`<div class="nsrc">${n.sources.map((s2) => html`<span class="tag">${s2.tier === "private" ? I("lock", "sm") : ""}${/^https:\/\//.test(s2.ref) && !env.snap ? html`<a href="${esc(s2.ref)}" target="_blank" rel="noopener">${esc(sourceChip(s2))}</a>` : esc(sourceChip(s2))}</span>`)}</div>` : ""}
		${env.snap ? "" : html`<div class="nacts">${c.draft || c.type === "question" ? B("Use this in the reply", "usenote", { sm: true, ic: "spark", v: i }) : ""}${B("Ask more", "askmore", { sm: true, ghost: true })}</div>`}</div></li>`;
  }
  function markBox(r, u) {
    if (env.snap) return html`<p class="m markrow">Not right? Say <span class="verb">wrong ${esc(r.code)}: …</span>, <span class="verb">incomplete ${esc(r.code)}: …</span>, or <span class="verb">unneeded ${esc(r.code)}</span>.</p>`;
    if (!u.marking) return html`<div class="markrow">${B("Not right?", "markopen", { sm: true, ghost: true, aria: html`aria-label="Tell ${esc(env.name)} the reply to ${esc(first(r.who.name))} was not right"` })}</div>`;
    const k = u.mark || "wrong", m = MARKS.find((x) => x[0] === k), back = k === "unneeded" && r.rule && Date.parse(r.undoUntil || "") > Date.now(), busy = u.status === "pending";
    return html`<form class="markf" data-form="mark" aria-label="What was not right about ${esc(r.code)}">
		<div class="filters" role="group" aria-label="What was not right">${MARKS.map(([v, l]) => html`<button type="button" class="chip" data-act="markkind" data-v="${esc(v)}" aria-pressed="${k === v}">${esc(l)}</button>`)}</div>
		<label class="sr" for="mk-${esc(r.code)}">${esc(m[2])}</label><textarea id="mk-${esc(r.code)}" class="edit" data-input="marknote" rows="2" placeholder="${esc(m[2])}">${esc(u.marknote || "")}</textarea>
		<div class="markacts"><button class="btn sm primary${busy ? raw(" busy") : ""}" type="submit"${busy || S.offline ? raw(" disabled") : ""}>${busy ? raw('<span class="spin" aria-hidden="true"></span>') : ""}<span class="bl">${esc(busy ? "Telling it…" : back ? "Take it back" : m[3])}</span></button>${B("Cancel", "markcancel", { sm: true, ghost: true })}</div>
		<p class="m">${k === "unneeded" ? r.rule ? html`Rule ${esc(r.rule)} will ask you first from now on.` : html`${esc(env.name)} notes it so it can learn.` : esc("Nothing is sent until you approve the new draft in Needs you.")}</p></form>`;
  }
  var sentOf = (c) => ({ code: c.code, sent: true, notes: V.done.find((r) => r.code === c.code && r.notes)?.notes ?? c.notes ?? [] });
  function askThread(c, u) {
    if (env.snap) return "";
    return html`<section class="c-sec askt" aria-label="Ask ${esc(env.name)} about ${esc(c.code)}">
		<div class="askt-h">${I("spark")}Ask ${esc(env.name)}<span>Only you see this. Each question is one AI run in this item’s session.</span></div>
		${c.notes.length ? html`<ol class="notes" aria-live="polite">${c.notes.map((n, i) => noteHtml(c, n, i))}</ol>` : ""}
		<form class="askf" data-form="ask"><label class="sr" for="askin-${esc(c.code)}">Ask ${esc(env.name)} about ${esc(c.code)}</label><input id="askin-${esc(c.code)}" data-input="ask" placeholder="${esc(c.sent ? "Ask about this. Nothing is sent." : "Ask about this before you send…")}" autocomplete="off" value="${esc(u.ask)}"${S.offline ? raw(" disabled") : ""}><button class="btn sm ghost" type="submit"${S.offline ? raw(" disabled") : ""}>${I("send", "sm")}Ask</button></form></section>`;
  }
  function workBlock(c) {
    const k = c.work;
    if (!k) return "";
    const btn = (label, verb, o = {}) => B(label, "rowact", { sm: true, v: `${verb}`, verb, aria: html`data-key="work:${esc(c.code)}"`, ...o });
    const who2 = { you: "you", them: "them", me: env.name };
    const plan = k.plan.length ? html`<ul class="plan" aria-label="Plan">${k.plan.map((p) => html`<li class="${p.done ? raw("done") : ""}"><span aria-hidden="true">${esc(p.done ? "✓" : "○")}</span> ${esc(p.what)} <span class="m">${esc([who2[p.who] ?? p.who, p.where, p.build && `build ${p.build}`].filter(Boolean).join(" · "))}</span></li>`)}</ul>` : "";
    return html`<div class="c-sec work" aria-label="This work"><p class="also-line">${I("eye", "sm")}<span><b>${k.proposed ? esc("Track as work?") : k.home ? html`Part of ${esc(k.home)}:` : esc("This work:")}</b> ${esc(k.goal)}${k.waiting ? html` · waiting on ${esc(k.waiting)}` : k.next ? html` · next: ${esc(k.next)}` : ""}</span></p>
		${plan}<ol class="steps">${k.steps.map((x) => html`<li${x.news ? raw(' class="news"') : ""}><span class="m">${esc(when(x.at))}</span> ${esc(x.what)}</li>`)}</ol>
		${k.due && !U(`work:${c.code}`).msg ? html`<div class="acts">${btn("Wait 3 days", `wait ${c.code}: 3d`)}${btn("Close", `close ${c.code}`, { ghost: true })}</div>` : ""}${rowState(`work:${c.code}`)}</div>`;
  }
  var debugBlock = (c, u) => c.debug ? html`<div class="c-sec"><details class="why" data-dbg${u.dbgOpen ? raw(" open") : ""}><summary>${I("right", "sm chev")}<span class="rs"><b>Details</b></span></summary><div class="why-b"><pre class="dbg">${esc(c.debug.join("\n"))}</pre>${env.snap ? "" : B("Copy details", "copydebug", { sm: true, ghost: true })}</div></details></div>` : "";
  function card(c, enter, o = {}) {
    const u = U(c.code), done = S.done.get(c.code);
    if (done) return html`<article class="card" id="card-${esc(c.code)}" data-code="${esc(c.code)}" aria-labelledby="ap-${esc(c.code)}" tabindex="-1"><div class="applied" role="status"><span class="ok">${I("check", "lg")}</span><p id="ap-${esc(c.code)}"><b>${esc(done.msg)}</b><span>${esc(c.who.name)} · ${esc(c.chat.name)}</span></p><span class="code">${esc(c.code)}</span></div>${((r) => r ? html`<div class="c-sec">${markBox(r, u)}</div>` : "")(V.done.find((r) => r.code === c.code && r.notes))}${askThread(sentOf(c), u)}</article>`;
    return html`<article class="card${enter ? raw(" enter") : ""}" id="card-${esc(c.code)}" data-code="${esc(c.code)}" data-rev="${esc(c.rev)}" aria-labelledby="h-${esc(c.code)}" tabindex="-1">
		${u.stale ? html`<div class="stale" role="status">${I("warn")}<p><b>Changed since you looked.</b> There is a newer version of this item.</p>${B("Show the new version", "shownew", { sm: true })}</div>` : ""}
		<div class="c-sec">${head(c, u)}${askBlock(c, u)}</div>
		${o.work === false ? "" : workBlock(c)}
		<div class="c-sec">${bodyOf(c, u)}</div>
		${why(c, u)}${debugBlock(c, u)}
		<div class="c-sec c-foot">${actions(c, u)}</div>
		${askThread(c, u)}</article>`;
  }

  // src/web/app/view/classic/knowledge-card.ts
  function kCard(k) {
    const u = U(k.code), on = factsOn(k, u), n = on.size, done = S.done.get(k.code);
    if (done) return html`<article class="card" data-code="${esc(k.code)}"><div class="applied" role="status"><span class="ok">${I("check", "lg")}</span><p><b>${esc(done.msg)}</b><span>${esc(k.topic)}</span></p><span class="code">${esc(k.code)}</span></div></article>`;
    const cmd = kCmd(k, u);
    const by = (f) => esc([f.who, f.date].filter(Boolean).join(", "));
    return html`<article class="card" data-code="${esc(k.code)}" data-rev="${esc(k.rev)}" aria-labelledby="h-${esc(k.code)}">
		${u.stale ? html`<div class="stale" role="status">${I("warn")}<p><b>Changed since you looked.</b></p>${B("Show the new version", "shownew", { sm: true })}</div>` : ""}
		<div class="c-sec"><div class="c-head"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-text)">${I("book")}</span><div class="c-who"><h2 class="c-name" id="h-${esc(k.code)}">${esc(k.topic)}</h2><div class="c-meta" style="display:block">${k.home === "personal" ? html`${I("lock", "sm")} Saves to your own knowledge` : esc("Saves to team knowledge")}</div></div><span class="code">${esc(k.code)}</span></div></div>
		<div class="c-sec"><div class="lbl-row"><span>Facts to save</span><span class="sp"></span><span style="text-transform:none;letter-spacing:0;font-weight:500">${n} of ${k.facts.length} selected</span></div>
		<ul class="cmts" style="margin:0">${k.facts.map((f, i) => html`<li><label class="cmt"><input type="checkbox" data-fact="${i + 1}" id="f-${esc(k.code)}-${i + 1}"${on.has(i + 1) ? raw(" checked") : ""}${env.snap ? raw(" disabled") : ""}><span class="mk">${I("check")}</span><span class="cb"><span class="loc" style="font-family:var(--font)"><span class="tag accent">${esc(f.type)}</span>${f.private ? html`<span class="tag">${I("lock", "sm")}From a private chat</span>` : ""}</span><p>${esc(f.text)}</p><span style="font-size:12px;color:var(--text-3)">${f.href && !env.snap ? html`<a href="${esc(f.href)}" target="_blank" rel="noopener" style="color:inherit">${by(f)}</a>` : by(f)}</span></span></label></li>`)}</ul></div>
		<div class="c-sec c-foot">${stateLine(u, u.verb || cmd)}<div class="acts">${B(n ? `Save ${plural(n, "fact")}` : "Save", "primary", { primary: true, id: `pri-${k.code}`, disabled: !n || u.stale, busy: u.status === "pending", busyLabel: "Saving…", verb: cmd })}${B("Skip", "skipk", { ghost: true, verb: `skip ${k.code}` })}</div>${env.snap ? "" : html`<p class="vh">or type ${kbd(cmd)} in Teams or your AI chat</p>`}</div></article>`;
  }

  // src/web/app/view/classic/banners.ts
  function banners() {
    const off = S.offline ? html`<div class="health off" role="alert"><span class="hi">${I("off", "lg")}</span><p><b>Lost connection to ${esc(env.name)}.</b> <span>Retrying… Nothing you do now is lost; actions already sent will not be sent twice.</span></p></div>` : "";
    const h = V.health[0], st = U("health");
    if (!h) return off;
    const more = V.health.length > 1 ? html` <span>And ${esc(plural(V.health.length - 1, "more problem"))}.</span>` : "";
    const fix = h.fix ? B(h.fix.label, "healthfix", { busy: st.status === "pending", busyLabel: "Checking…", verb: h.fix.command }) : "";
    return html`${off}<section class="health" aria-label="Problem with ${esc(env.name)}"><span class="hi">${I("warn", "lg")}</span><p><b>${esc(h.text)}</b>${h.since ? html` <span>Since ${esc(when(h.since))}.</span>` : ""}${more}${st.msg ? html` <span class="hm">${esc(st.msg)}</span>` : ""}</p>${fix}</section>`;
  }

  // src/web/app/view/classic/tabs/done.ts
  var DONE_ICON = { reply: "reply", review: "pr", change: "task", reminder: "clock", learned: "book", closed: "check", catchup: "eye" };
  var seenOf = (k) => S.seenOpen?.[k] ?? V.seen?.[k] ?? V.since ?? "";
  function cuRow(r, home2 = false) {
    const key = `row:${r.code}`, u = peek(key), w = S.watchOpen === r.code;
    const meta = html`<span class="m">${join([r.by, when(r.at)].filter(Boolean).map((x) => esc(x)), raw(" · "))}${r.watchedAs ? html` · <span class="tag ok">Watching as ${esc(r.watchedAs)}</span>` : ""}</span>`;
    const text2 = html`<b>${esc(r.sentence)}</b>${r.gist ? html`<span class="gist">${esc(r.gist)}</span>` : ""}${meta}`;
    const body6 = r.teams && !env.snap ? html`<a class="rt rlink" href="${esc(r.teams)}" target="_blank" rel="noopener" data-act="cuopen" data-v="${esc(r.code)}" title="Open in Teams">${text2}</a>` : html`<div class="rt">${text2}</div>`;
    const acts = env.snap || u.msg ? "" : html`<div class="rowacts">${r.watchedAs ? "" : B("Watch", "watchopen", { sm: true, ghost: true, v: r.code })}${B("Needs me", "rowact", { sm: true, ghost: true, v: `mine ${r.code}`, verb: `mine ${r.code}`, aria: html`data-key="${esc(key)}"` })}</div>`;
    const form = w ? watchForm(r) : "";
    return html`<li class="row cu${home2 ? raw(" home") : ""}" data-code="${esc(r.code)}"><span class="ri">${I(r.high ? "warn" : "eye")}</span>${body6}${r.teams && !env.snap ? html`<a class="ext" href="${esc(r.teams)}" target="_blank" rel="noopener" aria-label="Open in Teams" data-act="cuopen" data-v="${esc(r.code)}">${I("ext", "sm")}</a>` : ""}${acts}${rowState(key)}${form}</li>`;
  }
  function watchForm(r) {
    const f = S.watchForm ?? rowWatchOf(r);
    return html`<div class="wform" role="group" aria-label="Watch this"><label class="fl" for="wt-${esc(r.code)}">Watch</label><input class="field" id="wt-${esc(r.code)}" data-wf="target" value="${esc(f.target)}"><label class="fl" for="wu-${esc(r.code)}">until</label><input class="field" id="wu-${esc(r.code)}" data-wf="until" value="${esc(f.until)}">
		<div class="seg" role="group" aria-label="Done by">${BY.map(([k, l]) => html`<button type="button" data-act="wby" data-v="${esc(k)}" aria-pressed="${f.by === k}">${esc(l)}</button>`)}</div>
		<div class="acts">${B("Start watching", "watchgo", { primary: true, sm: true, v: r.code, disabled: !f.target.trim() })}${B("Cancel", "watchcancel", { sm: true, ghost: true })}</div></div>`;
  }
  function row(r) {
    if (r.kind === "catchup") return cuRow(r);
    const key = `row:${r.code}`, left = r.undoUntil ? Math.round((Date.parse(r.undoUntil) - Date.now()) / 1e3) : 0, u = peek(key), ru = peek(r.code);
    const undo = left > 0 && !u.msg ? raw(String(B("Undo", "undo", { v: r.code, busy: u.status === "pending", busyLabel: "Taking it back…", verb: `undo ${r.code}`, aria: html`aria-label="Undo the reply to ${esc(first(r.who.name))}"` })).replace('<span class="bl">Undo</span>', String(html`${I("undo", "sm")}<span class="bl">Undo <span class="tnum" data-until="${esc(r.undoUntil)}" style="color:var(--text-3);font-weight:500">${esc(mmss(left))}</span></span>`))) : "";
    const link = r.teams || r.href;
    const reply = r.kind === "reply" || r.kind === "review", where = r.sentence.match(/ in (.+)$/);
    const meta = html`<span class="m">${join([reply ? `${r.who.name}${where ? ` · ${where[1]}` : ""}` : r.by && r.kind !== "learned" ? r.by : "", reply ? r.by : "", when(r.at), left > 0 && !u.msg ? "you can take it back" : ""].filter(Boolean).map((x) => esc(x)), raw(" · "))}${link && !env.snap ? html` · <a class="ext-in" href="${esc(link)}" target="_blank" rel="noopener">Open ${esc(r.teams ? "in Teams" : "")}↗</a>` : ""}</span>`;
    const work = r.work ? html`<span class="tag${/^Closed/.test(r.work) ? raw(" ok") : ""}">${esc(r.work)}</span>` : "";
    const lead = reply ? av(r.who) : html`<span class="ri">${I(DONE_ICON[r.kind])}</span>`;
    const lines = reply && (r.ask || r.said) ? html`${r.ask ? html`<span class="qa"><b>${esc(first(r.who.name))} asked:</b> ${esc(r.ask)}</span>` : html`<b>${esc(r.sentence)}</b>`}${r.said ? html`<span class="qa you"><b>You${esc(r.inTeams ? " (in Teams)" : "")}:</b> ${esc(r.said)}</span>` : ""}` : html`<b>${esc(r.sentence)}</b>${r.gist ? html`<span class="gist">${esc(r.gist)}</span>` : r.said ? html`<span class="gist">“${esc(r.said)}”</span>` : ""}`;
    const main2 = html`${lead}<div class="rt">${lines}${meta}${work}${rowState(key)}</div>`;
    if (r.text && !undo) return html`<li data-code="${esc(r.code)}"><details class="rowx" data-row${ru.open || ru.marking || r.notes?.some((n) => !n.a) ? raw(" open") : ""}><summary class="row">${main2}${I("right", "sm")}</summary><div class="sent">${esc(r.text)}</div>${r.why ? why({ why: r.why, who: r.who }, ru) : ""}${r.notes ? html`<div class="c-sec">${markBox(r, ru)}</div>` : ""}${r.notes ? askThread({ code: r.code, sent: true, notes: r.notes }, ru) : ""}</details></li>`;
    return html`<li class="row${undo ? raw(" undo-row") : ""}">${main2}${undo}</li>`;
  }
  function doneList(f) {
    if (f === "closed") f = "catchup";
    const shown = (r) => r.kind !== "closed";
    const rows2 = V.done.filter((r) => shown(r) && (f === "all" || DONE_KINDS[f]?.includes(r.kind)));
    const chips = [["all", "All", V.done.filter(shown).length, newCount(V)], ...Object.entries(DONE_KINDS).map(([k, ks]) => [k, CHIP_LABEL[k] ?? k[0].toUpperCase() + k.slice(1), V.done.filter((r) => ks.includes(r.kind)).length, V.done.filter((r) => ks.includes(r.kind) && isNew(r, seenIn(V), itemSeen(V))).length])].filter((x) => x[2]);
    const fresh = rows2.filter((r) => isNew(r, seenOf, itemSeen(V))), earlier = rows2.filter((r) => !isNew(r, seenOf, itemSeen(V)));
    const list2 = (h, rs) => rs.length ? html`${h ? html`<h2 class="section-h">${esc(h)}</h2>` : ""}<ul class="rows">${rs.map(row)}</ul>` : "";
    const quiet = f === "catchup" ? V.done.filter((r) => r.kind === "closed") : [];
    const foot = quiet.length ? html`<details class="quiet"><summary class="m">Also closed ${quiet.length} with nothing to know · Show</summary><ul class="rows">${quiet.map((r) => html`<li class="row"><span class="ri">${I("check")}</span><div class="rt"><b>${esc(r.sentence)}</b><span class="m">${esc(when(r.at))}${r.teams && !env.snap ? html` · <a class="ext-in" href="${esc(r.teams)}" target="_blank" rel="noopener">Open in Teams↗</a>` : ""}</span></div></li>`)}</ul></details>` : "";
    const body6 = rows2.length ? html`${list2(fresh.length && earlier.length ? "New" : "", fresh)}${list2(fresh.length ? "Earlier this week" : "", earlier)}` : html`<p class="empty">${esc(f === "catchup" ? "Nothing to catch up on in the last 7 days." : "Nothing in the last 7 days.")}</p>`;
    const sub = f === "catchup" ? `What ${env.name} read for you and closed with no reply. Click a row to open it in Teams.` : "The last 7 days. Open a reply to see what was sent and why.";
    return html`${banners()}<div style="max-width:880px">${listHead("Done", sub)}
		<div class="filters" role="group" aria-label="Filter">${chips.map(([k, l, n, nw]) => html`<a class="chip" href="#done/${esc(k)}" aria-pressed="${f === k}" style="display:inline-flex;align-items:center;gap:6px">${esc(l)}<span class="tnum" style="color:var(--text-3)">${n}</span>${nw ? html`<span class="newpill">${nw} new</span>` : ""}</a>`)}</div>${body6}${foot}</div>`;
  }

  // src/web/app/view/classic/tabs/home.ts
  var TILE_ICON = { replies: "reply", reviews: "pr", tasks: "task", prs: "pr", invites: "cal", reminders: "clock", knowledge: "book", watching: "eye", waiting: "clock", running: "bolt", automations: "clock", learned: "book", suggestions: "bolt" };
  var TILE_HREF = { replies: "#done/replies", reviews: "#done/reviews", tasks: "#done/changes", prs: "#done/changes", invites: "#done/changes", reminders: "#done/reminders", knowledge: "#knowledge", watching: "#ongoing", waiting: "#ongoing", running: "#ongoing/running", automations: "#ongoing/automations", learned: "#done/learned", suggestions: "#settings/learned" };
  var sentence = (t) => {
    const m = /^(.*?)(\d+)(.*)$/.exec(t.label);
    return m ? html`${esc(m[1])}<b>${raw(m[2])}</b>${esc(m[3])}` : html`<b>${t.count}</b> ${esc(t.label)}`;
  };
  function missedForm() {
    if (env.snap) return raw(`<p class="ver">Missed a message? In your self-chat, say <span class="verb">missed &lt;Teams message link&gt;</span>.</p>`);
    return html`<form class="askf missf" data-form="missed" aria-label="Missed a message"><label class="sr" for="missin">Paste the Teams link of a message ${esc(env.name)} missed</label><input id="missin" placeholder="Missed a message? Paste its Teams link here" autocomplete="off" value="${esc(S.missedLink || "")}"${S.offline ? raw(" disabled") : ""}><button class="btn sm ghost" type="submit"${S.offline || S.missing ? raw(" disabled") : ""}>${S.missing ? raw('<span class="spin" aria-hidden="true"></span>') : ""}Make an item</button></form>`;
  }
  function versionLine() {
    const v = V.version;
    if (!v?.code || env.snap) return "";
    const st = S.checking ? "" : v.failed ? `Could not check: ${v.failed}` : v.last?.rolledBack && v.last.to !== v.code ? `${v.last.to} did not start, so this stays on ${v.code}` : v.checkedAt ? `Up to date, checked ${when(v.checkedAt)}` : "Not checked yet";
    const how2 = v.channel === "off" ? "Updates when you check" : `${v.channel === "release" ? "Updates to each release" : "Updates to every change"}, ${v.everyMin >= 1440 ? "checked once a day" : v.everyMin >= 60 ? "checked every hour" : `checked every ${v.everyMin || 10} minutes`}`;
    return html`<p class="ver"><span>Version ${esc(v.tag ? `${v.tag} (${v.code})` : v.code)}</span><span>${esc(how2)}</span>${st ? html`<span>${esc(st)}</span>` : ""}${B(S.checking ? "Checking…" : "Check for updates", "checkupdate", { sm: true, ghost: true, busy: S.checking })}${B("Report a problem", "reportopen", { sm: true, ghost: true })}</p>${S.reporting ? html`<form class="markf missf" data-form="report" aria-label="Report a problem"><label class="sr" for="repin">What went wrong</label><textarea id="repin" class="edit" rows="3" placeholder="What went wrong, and what should it have done?"></textarea><div class="markacts"><button class="btn sm primary" type="submit"${S.offline ? raw(" disabled") : ""}>Send to the feedback log</button>${B("Cancel", "reportcancel", { sm: true, ghost: true })}</div></form>` : ""}`;
  }
  function catchUpCard() {
    const c = V.catchUp;
    if (!c?.count) return "";
    const more = c.count - c.top.length;
    return html`<div class="also-hrow"><h2 class="also-h">Catch up · ${c.count} new</h2>${env.snap ? "" : B("Mark all read", "seenall", { sm: true, ghost: true, v: "catchup" })}</div><div class="catchup"><ul class="rows">${c.top.map((r) => cuRow(r, true))}</ul><a class="mini-more" href="#done/catchup">${more > 0 ? html`${more} more · ` : ""}See all</a></div>`;
  }
  function home() {
    const o = openCards(), tiles = V.tiles.filter((t) => t.key !== "needs");
    const handled = tiles.reduce((n, t) => n + t.count, 0);
    const need = o.length ? html`<div class="tile need" role="group" aria-labelledby="need-h">
			<div class="need-head"><span class="big tnum">${o.length}</span><span class="lbl" id="need-h">${esc(o.length === 1 ? "needs you" : "need you")}</span></div>
			<ul class="peek">${o.slice(0, 4).map((c) => html`<li><a href="#focus/${esc(c.code)}">${av(c.who, "sm")}<span class="nm">${esc(first(c.who.name))}</span><span class="ps">${esc(forPage(c.question) || c.ask || c.job || "")}</span></a></li>`)}</ul>
			<div class="foot">${env.snap ? "" : html`<a class="btn primary" href="#focus/${esc(o[0].code)}">Start with ${esc(first(o[0].who.name))} ${I("arrow")}</a>`}<span class="more">${o.length > 4 ? html`and ${o.length - 4} more` : ""}</span></div></div>` : html`<div class="tile need" role="group"><span class="ti" style="background:var(--success-soft);color:var(--success)">${I("check")}</span><span class="big" style="font-size:22px">All clear</span><span class="lbl">Nothing needs you.</span></div>`;
    return html`${banners()}
	<section class="hello" aria-labelledby="hello-h"><h1 id="hello-h">Since you were away</h1><p>${V.since ? html`You left ${esc(when(V.since))}` : esc("In the last day")}${handled ? html` · ${esc(env.name)} handled ${esc(plural(handled, "thing"))} for you` : ""}</p></section>
	<div class="tiles">${need}${tiles.map((t) => html`<a class="tile" href="${raw(TILE_HREF[t.key] || "#done")}" aria-label="${esc(t.label)}"><span class="ti">${I(TILE_ICON[t.key] || "check")}</span><span class="go">${I("arrow")}</span><span class="sent">${sentence(t)}</span>${t.sub ? html`<span class="sub">${esc(t.sub)}</span>` : ""}</a>`)}</div>
	${catchUpCard()}
	${V.also.length ? html`<h2 class="also-h">Also for you</h2><div class="also">${V.also.map((t) => html`<a class="mini" href="${raw(String(TILE_HREF[t.key]))}"><span class="ti">${I(TILE_ICON[t.key])}</span><div><b>${t.count || !t.sub ? html`${t.count} ${esc(t.label)}` : esc(t.sub)}</b>${t.count && t.sub ? html`<span>${esc(t.sub)}</span>` : ""}</div></a>`)}</div>` : ""}${missedForm()}${versionLine()}`;
  }

  // src/web/app/view/classic/snapshot.ts
  var snapshot = () => html`<div class="snapnote">${I("info")}<span>This is a snapshot. To act, reply in your Teams self-chat with the words on each card, or run <code>${esc(env.cmd)} open</code>.</span></div>
	${home()}${V.needs.length ? html`<h2 class="also-h">Needs you</h2><div style="display:flex;flex-direction:column;gap:16px;max-width:720px">${V.needs.map((c) => card(c))}</div>` : ""}
	${V.knowledge.length ? html`<h2 class="also-h">To learn</h2><div style="display:flex;flex-direction:column;gap:16px;max-width:720px">${V.knowledge.map(kCard)}</div>` : ""}`;

  // src/web/app/view/classic/tabs/focus.ts
  function focus(enter) {
    const o = openCards(), q = queue();
    const cur = q.find((c) => c.code === S.cur) || o[0];
    if (!cur) return html`${banners()}<div class="stage" style="margin:40px auto"><div class="alldone"><div class="ok">${I("check", "lg")}</div><h2>That’s everything</h2><p>${S.done.size ? html`${S.done.size} handled. ` : ""}Nothing else needs you.</p><div class="acts" style="justify-content:center"><a class="btn primary" href="#home">Back to Home</a><a class="btn" href="#done">See what was done</a></div></div></div>`;
    const pos = o.indexOf(cur), n = o.length;
    const rows2 = q.map((c) => {
      const d = S.done.has(c.code);
      return html`<li><button class="qrow${d ? raw(" done") : ""}" data-act="goto" data-v="${esc(c.code)}" aria-current="${c.code === cur.code}">${d ? html`<span class="chk">${I("check", "sm")}</span>` : av(c.who, "sm")}<span class="qt"><span class="qn">${esc(first(c.who.name))}<span class="code">${esc(c.code)}</span></span><span class="qs">${esc(c.question || c.ask || "")}</span></span></button></li>`;
    });
    return html`${banners()}<div class="focus">
		<nav class="queue" aria-label="Needs you queue"><h2><span>Needs you</span><span class="tnum">${n}</span></h2><ol>${rows2}</ol></nav>
		<div class="stage"><div class="pager">
			<a class="btn ghost sm icon" href="#home" aria-label="Back to Home">${I("back")}</a><span class="sp"></span>
			<button class="btn sm" data-act="prev" aria-label="Previous item"${pos <= 0 ? raw(" disabled") : ""}>${I("left")}<span class="lbl-txt">Previous</span></button>
			<span class="of tnum">${esc(pos < 0 ? `${n} left` : `${pos + 1} of ${n}`)}</span>
			<button class="btn sm" data-act="next" aria-label="Next item"${(pos < 0 ? !n : pos >= n - 1) ? raw(" disabled") : ""}><span class="lbl-txt">Next</span>${I("right")}</button>
			<span class="sp"></span><button class="btn ghost sm icon" data-act="keys" aria-label="Keyboard shortcuts">${I("key")}</button></div>
		${card(cur, enter)}
		${S.done.has(cur.code) ? "" : html`<div class="hints"><span>${kbd("j")} next</span><span>${kbd("k")} previous</span><span>${kbd("⌘")}${kbd("↵")} ${esc(primary(cur).label.toLowerCase())}</span><span>${kbd("a")} ask</span><span>${kbd("l")} later</span><span>${kbd("?")} all keys</span></div>`}</div></div>`;
  }

  // src/web/app/view/classic/tabs/learn.ts
  var knowledgeList = () => html`${banners()}${listHead("To learn", "Facts waiting for your ok. Learned facts are saved by themselves; see Done, Learned.")}${V.knowledge.length ? html`<div style="display:flex;flex-direction:column;gap:16px;max-width:720px">${V.knowledge.map(kCard)}</div>` : raw('<p class="empty">Nothing to learn right now.</p>')}`;

  // src/web/app/view/classic/tabs/ongoing.ts
  var runningRows = () => html`${V.running.map((r) => html`<article class="wcard"><div class="c-head"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-text)">${I(r.code ? "pr" : "book")}</span><div class="c-who"><h3>${esc(r.what)}</h3><span class="m">${r.who ? html`For ${esc(r.who)} · ` : ""}since ${esc(when(r.since))}</span></div>${r.code ? html`<span class="code">${esc(r.code)}</span>` : ""}</div>
		${r.progress != null ? html`<div class="bar" role="progressbar" aria-label="${esc(r.what)}" aria-valuenow="${Math.round(r.progress * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(4, Math.round(r.progress * 100))}%;animation:none"></i></div>` : html`<div class="bar" role="progressbar" aria-label="${esc(r.what)}" aria-valuetext="Running"><i></i></div>`}
		<div class="acts"><span class="sp"></span>${r.code ? B("Open on your computer", "rowact", { sm: true, ic: "pc", v: `continue ${r.code}`, verb: `continue ${r.code}`, aria: html`data-key="row:${esc(r.code)}"` }) : ""}</div>${r.code ? rowState(`row:${r.code}`) : ""}</article>`)}`;
  function timing(w) {
    if (!w.every || env.snap) return "";
    const opts = INTERVALS.some(([m]) => m === w.every) ? INTERVALS : [...INTERVALS, [w.every, `${w.every} min`]].sort((a, b) => a[0] - b[0]);
    const ends = w.endsAt ? html`<span class="m">until ${esc(new Date(w.endsAt).toLocaleDateString(void 0, { month: "short", day: "numeric" }))}</span>${B("Extend 7 days", "rowact", { sm: true, ghost: true, v: `extend ${w.code}`, verb: `extend ${w.code}`, aria: html`data-key="row:${esc(w.code)}"` })}` : "";
    return html`<div class="timing"><label class="m">Every <select data-every="${esc(w.code)}" aria-label="How often ${esc(w.code)} checks">${opts.map(([m, l]) => html`<option value="${m}m"${m === w.every ? raw(" selected") : ""}>${esc(l)}</option>`)}</select></label>${ends}</div>`;
  }
  function ongoingView() {
    const ups = V.watching.filter((w) => w.update), rest = V.watching.filter((w) => !w.update);
    const btn = (w, label, verb, o = {}) => B(label, "rowact", { sm: true, v: `${verb} ${w.code}`, verb: `${verb} ${w.code}`, aria: html`data-key="row:${esc(w.code)}"`, ...o });
    const plan = (w) => [w.by ? `By ${(/* @__PURE__ */ new Date(`${w.by}T12:00:00`)).toLocaleDateString(void 0, { weekday: "short", month: "short", day: "numeric" })}` : "", w.nextAt && Date.parse(w.nextAt) > Date.now() ? `next check ${when(w.nextAt)}` : "", w.from ? `from ${w.from}` : ""].filter(Boolean).join(" · ");
    const card3 = (w) => html`<article class="wcard" aria-labelledby="w-${esc(w.code)}"><div class="c-head"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2)">${I("eye")}</span><div class="c-who"><h3 id="w-${esc(w.code)}">${esc(w.what)}</h3><span class="m">${esc([w.changedAt ? `Changed ${when(w.changedAt)}` : "", plan(w)].filter(Boolean).join(" · "))}</span></div><span class="code">${esc(w.code)}</span></div>
		<div class="chg"><span class="tag ok">${esc(w.last)}</span></div>
		${timing(w)}<div class="acts">${U(`row:${w.code}`).msg ? "" : html`${btn(w, "Got it", "ok", { primary: true })}${btn(w, "Stop watching", "skip", { ghost: true })}`}</div>${rowState(`row:${w.code}`)}</article>`;
    const wait = html`${(V.waiting || []).map((w) => html`<article class="wcard" aria-labelledby="wt-${esc(w.code)}"><div class="c-head"><span class="ri" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--surface-2);color:var(--text-2)">${I("clock")}</span><div class="c-who"><h3 id="wt-${esc(w.code)}">You asked ${esc(w.to)}</h3><span class="m">${esc(w.chat)} · ${esc(when(w.at))}${w.link ? html` · <a href="${esc(w.link)}" target="_blank" rel="noopener">Open in Teams</a>` : ""}</span></div><span class="code">${esc(w.code)}</span></div>
		<blockquote class="ask">${esc(w.text.length > 280 ? w.text.slice(0, 280) + "…" : w.text)}</blockquote>
		<div class="acts">${U(`row:${w.code}`).msg ? "" : html`${btn(w, "Follow up", "ok", { primary: true })}${btn(w, "Dismiss", "skip", { ghost: true })}`}</div>${rowState(`row:${w.code}`)}</article>`)}`;
    const prog = html`${(V.progress || []).map((w) => html`<li class="row" data-code="${esc(w.code)}">${av(w.who)}<div class="rt"><b>${esc(w.goal)}</b><span class="m">${esc([w.code, w.who.name, w.status].join(" · "))}</span>${w.last ? html`<span class="m">Last: ${esc(w.last.what.length > 160 ? w.last.what.slice(0, 160) + "…" : w.last.what)} · ${esc(when(w.last.at))}</span>` : ""}${w.checkAt ? html`<span class="m">I'll ask you on ${esc(new Date(w.checkAt).toLocaleDateString(void 0, { month: "short", day: "numeric" }))} if nothing happens</span>` : ""}${timing(w)}${rowState(`row:${w.code}`)}</div>${U(`row:${w.code}`).msg ? "" : btn(w, "Close", "close", { ghost: true })}</li>`)}`;
    const run = runningRows(), autos = html`${V.automations.map(autoRow)}`;
    return html`${banners()}${listHead("Ongoing", `Work still in progress, your asks nobody has answered, what ${env.name} watches or is doing now, and your reminders.`, env.snap ? "" : B("New automation", "newauto", { ghost: true, ic: "plus" }))}
		${prog ? html`<h2 class="section-h" style="margin-top:6px">In progress</h2><p class="m" style="margin:-4px 0 10px">Replied, and the work goes on. News comes back to the same item.</p><ul class="rows">${prog}</ul>` : ""}
		${wait ? html`<h2 class="section-h" style="margin-top:6px">Waiting on others</h2><p class="m" style="margin:-4px 0 10px">No answer for a day. Follow up drafts a short nudge for you to check first.</p><div class="grid2">${wait}</div>` : ""}
		${ups.length ? html`<h2 class="section-h" style="margin-top:6px">${esc(plural(ups.length, "update"))}</h2><div class="grid2">${ups.map(card3)}</div>` : ""}
		${rest.length ? html`<h2 class="section-h">No change</h2><ul class="rows">${rest.map((w) => html`<li class="row"><span class="ri">${I("eye")}</span><div class="rt"><b>${esc(w.what)}</b><span class="m">${esc(w.last)}</span>${plan(w) ? html`<span class="m">${esc(plan(w))}</span>` : ""}${timing(w)}${rowState(`row:${w.code}`)}</div><span class="code">${esc(w.code)}</span>${U(`row:${w.code}`).msg ? "" : btn(w, "Stop watching", "skip", { ghost: true })}</li>`)}</ul>` : ""}
		${(V.channels || []).length ? html`<h2 class="section-h">Channels</h2><ul class="rows">${V.channels.map((c, i) => html`<li class="row"><span class="ri">${I("eye")}</span><div class="rt"><b>${esc(c.name)}</b><span class="m">Threads you start, post in, or are mentioned in</span>${rowState(`row:ch${i}`)}</div>${U(`row:ch${i}`).msg ? "" : B("Stop watching", "rowact", { sm: true, ghost: true, v: `unwatch ${c.link}`, verb: `unwatch ${c.link}`, aria: html`data-key="row:ch${i}"` })}</li>`)}</ul>` : ""}
		${run ? html`<h2 class="section-h" id="running">Running</h2><p class="m" style="margin:-4px 0 10px">Long work ${esc(env.name)} is doing now. It tells you when each one is ready.</p><div class="grid2">${run}</div>` : ""}
		${autos ? html`<h2 class="section-h" id="automations">Automations</h2><p class="m" style="margin:-4px 0 10px">Each one carries the assistant marker and stops when ${esc(env.name)} is paused.</p><ul class="rows" style="max-width:880px">${autos}</ul>` : ""}
		${V.watching.length || (V.waiting || []).length || (V.channels || []).length || (V.progress || []).length || run || autos ? "" : raw(`<p class="empty">Nothing is ongoing. Say "watch PR 1234 until merged", or "remind Arun every weekday at 4 pm to update the doc".</p>`)}${S.sheet ? sheet() : ""}`;
  }

  // src/web/app/view/classic/tabs/settings.ts
  var SECTIONS = () => [["learned", "What it knows", `What ${env.name} knows about you`], ["you", "You and your replies"], ["replies", "Automatic replies"], ["timing", "Reminders and summary"], ["system", "Updates and system"]];
  var markUnsaved = (sec) => {
    const c = sec && document.querySelector(`.setnav a[href="#settings/${sec}"]`);
    if (c && !c.querySelector(".dot")) c.insertAdjacentHTML("beforeend", '<span class="dot" title="Not saved yet"></span>');
  };
  var detailsPanel = () => html`<h2 class="section-h">Details</h2><ul class="rows setrows"><li class="setrow"><b>Runner</b><span class="m">${esc(V.details.runner)}</span>${env.snap ? "" : html`<div class="markacts">${checkNow()}</div>`}</li><li class="setrow"><b>Today's log, newest first</b><pre class="dbg">${esc(V.details.log.join("\n") || "Nothing yet.")}</pre></li></ul>`;
  var modelsBlock = (m) => m ? html`<h3 class="section-h">AI models</h3><ul class="rows setrows"><li class="setrow" data-code="models"><b>${esc(m.set)}</b>${m.lines.map((l) => html`<span>${esc(l)}</span>`)}<span class="m">From the last 7 days, on every machine. To choose a model, open More, then AI model.</span></li></ul>` : "";
  function input(r) {
    const id = `set-${r.key}`, v = S.set[r.key] ?? r.value;
    if (r.kind === "text") return html`<textarea id="${esc(id)}" class="edit" data-set="${esc(r.key)}" rows="4">${esc(v)}</textarea>`;
    if (r.kind === "choice") return html`<select id="${esc(id)}" data-set="${esc(r.key)}">${(r.options ?? []).map((o) => html`<option value="${esc(o.value)}"${o.value === v ? raw(" selected") : ""}>${esc(o.label)}</option>`)}</select>`;
    if (r.kind === "bool") return html`<select id="${esc(id)}" data-set="${esc(r.key)}"><option value="false"${v === "false" ? raw(" selected") : ""}>Off</option><option value="true"${v === "true" ? raw(" selected") : ""}>On</option></select>`;
    return html`<input id="${esc(id)}" class="field" data-set="${esc(r.key)}" value="${esc(v)}"${r.kind === "number" ? raw(' inputmode="numeric"') : ""}>`;
  }
  function switchRow(r) {
    const u = U(`set:${r.key}`), on = (S.set[r.key] ?? r.value) === "true", id = `set-${r.key}`, busy = u.status === "pending";
    return html`<li class="setrow swrow" data-code="set:${esc(r.key)}" data-sec="${esc(r.section)}"><div class="swl"><b id="${esc(id)}-l">${esc(r.label)}</b><span class="m" id="${esc(id)}-h">${esc(r.help)}</span>${u.msg ? html`<span class="m" role="status">${esc(u.msg)}</span>` : ""}</div>${env.snap ? html`<span class="m">${esc(on ? "On" : "Off")}</span>` : html`<button class="uisw setsw${busy ? raw(" busy") : ""}" id="${esc(id)}" type="button" role="switch" aria-checked="${raw(String(on))}" aria-labelledby="${esc(id)}-l" aria-describedby="${esc(id)}-h" data-act="setswitch" data-v="${esc(r.key)}"${busy || S.offline ? raw(" disabled") : ""}><span class="uisw-l">${esc(on ? "On" : "Off")}</span><span class="uisw-t" aria-hidden="true"><i></i></span></button>`}</li>`;
  }
  function row2(r) {
    const u = U(`set:${r.key}`), changed = (S.set[r.key] ?? r.value) !== r.value;
    return html`<li class="setrow" data-code="set:${esc(r.key)}" data-sec="${esc(r.section)}"><label for="set-${esc(r.key)}"><b>${esc(r.label)}</b><span class="m">${esc(r.help)}</span></label>${input(r)}<div class="markacts">${B(u.status === "pending" ? "Saving…" : "Save", "saveset", { sm: true, primary: changed, v: r.key, disabled: !changed, busy: u.status === "pending" })}${r.key === "pollIdle" ? checkNow() : ""}${u.msg ? html`<span class="m">${esc(u.msg)}</span>` : ""}</div>${r.key === "pollIdle" ? rowState("row:retry") : ""}</li>`;
  }
  function settingsView() {
    const st = V.settings;
    if (!st) return html`${listHead("Settings", "")}<p class="empty">Settings are on the page in your browser: run "${esc(env.cmd)}".</p>`;
    const ab = st.about, act2 = (label, verb, o = {}) => B(label, "rowact", { sm: true, v: verb, verb, aria: html`data-key="row:${esc(verb.split(" ")[1])}"`, ...o });
    const sugg = html`${ab.suggestions.map((x) => html`<li class="setrow" data-code="${esc(x.code)}"><b>${esc(x.text)}</b><span class="m">${esc(x.does)}</span><span class="m">Evidence: ${esc(x.evidence)}</span>${U(`row:${x.code}`).msg ? "" : html`<div class="markacts">${act2("Turn on", `ok ${x.code}`, { primary: true })}${act2("Not now", `skip ${x.code}`, { ghost: true })}${act2("Never", `never ${x.code}`, { ghost: true })}</div>`}${rowState(`row:${x.code}`)}</li>`)}`;
    const rules = html`${ab.rules.map((r) => html`<li class="setrow"><b>${esc(r.text)}</b>${r.who ? html`<span class="m">For: ${esc(r.who)}</span>` : ""}<span class="m">${esc(r.learned ?? "You said this.")}${r.held ? raw(" · On hold") : ""}</span>${r.code && !U(`row:${r.code}`).msg ? html`<div class="markacts">${act2("Remove", `never ${r.code}`, { ghost: true })}</div>` : ""}${r.code ? rowState(`row:${r.code}`) : ""}</li>`)}` || raw('<li class="setrow"><span class="m">None: every reply waits for your ok.</span></li>');
    const fixed = st.fixed.map((f) => html`<li class="setrow"><b>${esc(f.label)}</b><span class="sent">${esc(f.value)}</span><span class="m">${esc(f.how)}</span></li>`);
    const rows2 = (sec, adv = false) => st.rows.filter((r) => r.section === sec && !!r.advanced === adv && r.kind !== "switch").map(row2);
    const sw = st.rows.filter((r) => r.kind === "switch");
    const changes = sw.length ? html`<h3 class="section-h">Changes ${esc(env.name)} may propose</h3><p class="m" style="margin:-4px 0 10px">Each one waits for your ok on its item. Turning one off edits only this list, never your items: an ok on a change it no longer allows is refused, even one approved but not made yet. Deploys follow "Where ${esc(env.name)} may deploy" above.</p><ul class="rows setrows">${sw.map(switchRow)}</ul>` : "";
    const unsaved = (sec) => st.rows.some((r) => r.section === sec && S.set[r.key] !== void 0 && S.set[r.key] !== r.value);
    const body6 = {
      learned: html`${sugg ? html`<h3 class="section-h">Suggestions</h3><ul class="rows setrows">${sugg}</ul>` : ""}<h3 class="section-h">Standing instructions</h3><ul class="rows setrows">${rules}</ul>${ab.chats?.length ? html`<h3 class="section-h">Chats you marked</h3><ul class="rows setrows">${ab.chats.map((c) => html`<li class="setrow"><b>${esc(c.name)}</b><span class="m">${esc(c.says[0].toUpperCase() + c.says.slice(1))}. Say "${esc(c.name)} is normal again" to undo.</span></li>`)}</ul>` : ""}<h3 class="section-h">Learning</h3><ul class="rows setrows">${rows2("learned")}</ul>`,
      you: html`<ul class="rows setrows">${rows2("you")}</ul>${changes}`,
      replies: html`<p class="m" style="margin:-4px 0 10px">Replies go out by themselves only for your <a href="#settings/learned">standing instructions</a>. These limits apply to every one.</p><ul class="rows setrows">${rows2("replies")}</ul>`,
      timing: html`<ul class="rows setrows">${rows2("timing")}</ul>`,
      system: html`<ul class="rows setrows">${rows2("system")}</ul>${modelsBlock(st.models)}<details class="adv" data-adv${S.advOpen ? raw(" open") : ""}><summary class="section-h">More</summary><ul class="rows setrows">${rows2("system", true)}</ul>${V.details ? detailsPanel() : ""}<h3 class="section-h">Changed by setup</h3><ul class="rows setrows">${fixed}</ul></details>`
    };
    const intro = { learned: `Ask your AI chat "what do you know about me?" for the same list. To change a rule you wrote, say "change my rules" there.` };
    const sub = S.route.split("/")[1], here = st.rows.find((r) => r.key === sub)?.section ?? sub;
    const nav = html`<nav class="setnav" aria-label="Settings sections">${SECTIONS().map(([id, l]) => html`<a class="chip" href="#settings/${esc(id)}"${here === id ? raw(' aria-current="location"') : ""}>${esc(l)}${id === "learned" && ab.suggestions.length ? html`<span class="newpill">${ab.suggestions.length}</span>` : ""}${unsaved(id) ? raw('<span class="dot" title="Not saved yet"></span>') : ""}</a>`)}</nav>`;
    const sections = SECTIONS().map(([id, l, h]) => html`<section class="setsec" id="setsec-${esc(id)}" aria-labelledby="setsec-${esc(id)}-h"><h2 class="section-h" id="setsec-${esc(id)}-h">${esc(h ?? l)}</h2>${intro[id] ? html`<p class="m" style="margin:-4px 0 10px">${esc(intro[id])}</p>` : ""}${body6[id]}</section>`);
    return html`${banners()}<div style="max-width:760px">${listHead("Settings", "Saved to the config in your storage folder, so every machine uses them from the next cycle.")}${nav}${sections}</div>`;
  }

  // src/web/app/view/classic/tabs/numbers.ts
  var num = (l, cls = "") => l.key ? html`<a class="num-link ${raw(cls)}" href="#numbers/${esc(l.key)}">${esc(l.text)}</a>` : html`<span class="${raw(cls)}">${esc(l.text)}</span>`;
  var line = (ls) => join(ls.map((l) => num(l)), raw(" · "));
  var how = (k) => html`<details class="num-how" data-how="${raw(k)}"${S.num.how.has(k) ? raw(" open") : ""}><summary>How is this counted?</summary><p>${esc(RULES(env.name)[k])}</p></details>`;
  function bar(b) {
    const cls = ["num-bar", b.before && "before", b.gaps.length && "gap", b.now && "now"].filter(Boolean).join(" ");
    const days = html`<span class="num-days" aria-hidden="true">${b.days.map((off) => html`<i${off ? raw(' class="off"') : ""}></i>`)}</span>`;
    const inner = html`<span class="num-bn" aria-hidden="true">${b.before ? "" : b.n}</span><span class="num-col" aria-hidden="true"><span class="num-fill" style="height:${b.height}%"></span></span>${days}<span class="num-bw" aria-hidden="true">${esc(b.label)}</span>`;
    return html`<li class="${raw(cls)}">${b.key ? html`<a class="num-bin" href="#numbers/${esc(b.key)}" aria-label="${esc(b.alt)}">${inner}</a>` : html`<span class="num-bin" role="img" aria-label="${esc(b.alt)}">${inner}</span>`}</li>`;
  }
  function card2(c) {
    const pct = c.meter ? Math.round(c.meter.n / c.meter.of * 100) : 0;
    return html`<section class="num-card" aria-labelledby="numh-${raw(c.rule)}"><h3 class="num-t" id="numh-${raw(c.rule)}">${esc(c.title)}</h3>
		<p class="num-main">${num(c.main)}</p>${c.meter ? html`<div class="num-meter" role="img" aria-label="${esc(`${c.meter.n} of ${c.meter.of} as drafted`)}"><i style="width:${pct}%"></i></div>` : ""}
		<ul class="num-lines">${c.lines.map((l) => html`<li>${line(l)}</li>`)}<li class="num-four">${num(c.four)}</li></ul>${how(c.rule)}</section>`;
  }
  function main(m) {
    const h = m.handled;
    return html`<section class="num-card num-hero" aria-labelledby="numh-handled">
		<h2 class="num-t" id="numh-handled">Handled for you</h2>
		<div class="num-head"><span class="num-big">${num(h.main)}</span>${h.trend ? html`<span class="num-trend${h.trend.dir ? raw(` ${h.trend.dir}`) : ""}">${esc(h.trend.text)}</span>` : ""}</div>
		${how("handled")}
		<ol class="num-bars" aria-label="Handled for you per week, the last 8 weeks">${m.bars.map(bar)}</ol>
		<p class="num-note">The last 8 weeks${m.gapNote ? html` · <span class="num-hatch" aria-hidden="true"></span> ${esc(m.gapNote)}` : ""}</p>
		${how("bars")}
		<p class="num-kinds">${line(h.kinds)}</p>
		${h.check || h.all ? html`<p class="num-row">${h.check ? num(h.check) : ""}<span class="sp"></span>${h.all ? html`<a class="num-link num-all" href="#numbers/${esc(h.all.key)}">${esc(h.all.text)} ${I("right", "sm")}</a>` : ""}</p>${h.check ? how("check") : ""}` : ""}
	</section>
	<div class="num-cards">${m.cards.map(card2)}</div>
	<section class="num-card num-foot" aria-label="Guardrails">
		<p><b>Corrections:</b> ${join(m.corrections.map((l) => num(l)), "")}</p>${how("corrections")}
		${m.unknown ? html`<p>${num(m.unknown)}</p>${how("unknown")}` : ""}
		<p>${esc(m.promises)}</p>${how("promises")}
		<div class="num-copy">${B("Copy a summary", "numcopy", { sm: true })}<span class="m">numbers only, no names and no message text</span></div>
		<details class="num-how" data-how="copy"${S.num.how.has("copy") ? raw(" open") : ""}><summary>See what is copied</summary><pre class="num-sum">${esc(m.summary)}</pre></details>
	</section>`;
  }
  function rows(d, codes) {
    const times = /* @__PURE__ */ new Map();
    for (const c of codes) times.set(c, (times.get(c) ?? 0) + 1);
    const one = (c) => {
      const r = d.rows[c], x = d.missed[c], n = times.get(c);
      const more = n > 1 ? html`<span class="m">Counted ${n} times: once for each send.</span>` : "";
      if (r) {
        const h = String(row(r)), coded = h.startsWith("<li data-code") ? h : h.replace(/^<li/, `<li data-code="${String(esc(c))}"`);
        return raw(n > 1 ? coded.replace(/<\/li>$/, `${more}</li>`) : coded);
      }
      if (c.startsWith("missed:")) return html`<li class="row" data-code="${esc(c)}"><span class="ri">${I("eye")}</span><div class="rt"><b>You pointed at this message. No item was made for it.</b><span class="m">${esc(x ? when(x.at) : "")}${x?.teams && !env.snap ? html` · <a class="ext-in" href="${esc(x.teams)}" target="_blank" rel="noopener">Open in Teams↗</a>` : ""}</span>${more}</div></li>`;
      return html`<li class="row" data-code="${esc(c)}"><span class="ri">${I("check")}</span><div class="rt"><b>${esc(c)} is no longer on file</b><span class="m">Its line in the log still counts.</span>${more}</div></li>`;
    };
    return html`<ul class="rows">${[...times.keys()].map(one)}</ul>`;
  }
  function list(d, key, l) {
    const back = html`<a class="num-back" href="#numbers">${I("left", "sm")}<span>All numbers</span></a>`;
    if (!l) return html`${back}<p class="empty">That list is not on this tab.</p>`;
    const all = l.groups.flatMap((g) => g.codes), shown = l.groups.filter((g) => g.codes.length);
    const body6 = !all.length ? html`<p class="empty">Nothing counted here ${esc(WINDOW_LABEL[d.window.key].toLowerCase())}.</p>` : l.groups.length > 1 ? join(shown.map((g) => html`<h3 class="section-h">${esc(g.title ?? "")} · ${g.codes.length}</h3>${rows(d, g.codes)}`), "") : rows(d, all);
    return html`${back}<h2 class="num-list-h" id="num-list" tabindex="-1" data-list="${esc(key)}">${esc(l.title)} <span class="tnum">${all.length}</span></h2>${body6}`;
  }
  function numbersView() {
    const name = env.name;
    if (!hasNumbers()) return html`${listHead("Numbers", "")}<p class="empty">The numbers open on the live page, not in this copy.</p>`;
    const n = S.num, d = n.data, sub = S.route.split("/").slice(1).join("/");
    const range = d && d.window.key === n.win ? /\(([^)]*)\)$/.exec(d.window.label)?.[1] ?? "" : "";
    const pick2 = html`<label class="num-win"><span class="sr">Window</span><select class="field" id="numwin" data-numwin>${WINDOWS.map((k) => html`<option value="${raw(k)}"${k === n.win ? raw(" selected") : ""}>${esc(WINDOW_LABEL[k])}</option>`)}</select></label>${range ? html`<span class="num-range m">${esc(range)}</span>` : ""}`;
    const head2 = listHead("Numbers", `Counted from ${name}'s own log on all your machines. Nothing is estimated.`, html`<span class="num-pick">${pick2}</span>`);
    const state = n.failed ? "failed" : d && !n.busy ? "ready" : "loading";
    const body6 = n.failed ? html`<div class="empty num-fail" role="alert"><p><b>Could not load the numbers.</b> ${esc(name)} could not be reached from this page, so nothing was counted. Nothing is lost: they load when you open this tab or change the window.</p>${B("Try again", "numretry", { sm: true })}</div>` : !d ? html`<p class="empty" role="status">Counting…</p>` : sub ? (() => {
      const lists = listsOf(d);
      return list(d, sub, Object.hasOwn(lists, sub) ? lists[sub] : void 0);
    })() : main(numbersModel(d, name));
    return html`<div class="numbers" data-state="${raw(state)}"${n.busy ? raw(' aria-busy="true"') : ""}>${head2}${body6}</div>`;
  }

  // src/web/app/view/next/switch.ts
  function uiSwitch(where) {
    if (env.snap || env.panel) return "";
    return html`<label class="uisw uisw-${raw(where)}"><span class="sr">App version</span><select aria-label="App version" data-ui-choice><option value="classic"${env.ui === "classic" ? raw(" selected") : ""}>Classic</option><option value="new"${env.ui === "new" ? raw(" selected") : ""}>New</option><option value="react">React (preview)</option></select></label>`;
  }

  // src/web/app/view/classic/index.ts
  var $ = (s2) => document.querySelector(s2);
  var keysOf = (name) => [["Next item", "j →"], ["Previous item", "k ←"], ["Primary action", "⌘ Enter"], ["Pick option or toggle change", "1 to 9"], ["Edit the reply", "e"], [`Ask ${name} about this`, "a"], ["Later", "l"], ["Undo the last automatic reply", "u"], ["Home", "g h"], ["Leave a field, then go back", "Esc"], ["This list", "?"]];
  function boot(app) {
    document.body.insertAdjacentHTML("afterbegin", str(html`${sprite}<a class="skip" href="#main">Skip to content</a>`));
    if (env.snap) document.body.classList.add("snap");
    app.innerHTML = str(html`<header class="top" role="banner"><div class="top-in">
	<a class="brand" href="#home" aria-label="${esc(env.name)} home"><span class="mark"><svg class="i" aria-hidden="true" style="width:17px;height:17px"><use href="#i-logo"/></svg></span><span class="bn">${esc(env.name)}</span></a>
	<nav class="tabs" id="tabs" aria-label="Views"></nav><span class="vt" id="vt"></span><span class="pill" id="status"></span>${uiSwitch("top")}${env.snap ? "" : raw('<button class="btn ghost icon" id="themebtn" data-act="theme"></button>')}
	<button class="btn ghost icon navbtn" id="navbtn" aria-expanded="false" aria-controls="tabs" aria-label="Views">${I("menu")}</button></div></header><main id="main" tabindex="-1"></main>`);
    document.body.insertAdjacentHTML("beforeend", str(html`<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div><div class="sr" id="live" aria-live="polite" aria-atomic="true"></div>
	<dialog id="keys" aria-labelledby="keys-h"><div class="sheet-h"><h2 id="keys-h">Keyboard</h2><button class="btn ghost icon sm" data-close aria-label="Close">${I("x")}</button></div><div class="sheet-b"><table class="keys"><tbody>
	${keysOf(env.name).map(([a, k]) => html`<tr><td>${esc(a)}</td><td>${raw(k.split(" ").map((x) => str(kbd(x))).join(" "))}</td></tr>`)}
	</tbody></table></div></dialog>`));
    $("#keys [data-close]").addEventListener("click", () => $("#keys").close());
    $("#navbtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const o = !$("#tabs").classList.contains("open");
      $("#tabs").classList.toggle("open", o);
      $("#navbtn").setAttribute("aria-expanded", String(o));
    });
    $("#tabs").addEventListener("click", () => {
      $("#tabs").classList.remove("open");
      $("#navbtn").setAttribute("aria-expanded", "false");
    });
  }
  var VIEWS = {
    home,
    focus: (enter) => focus(enter),
    done: () => doneList(S.route.split("/")[1] || "all"),
    ongoing: ongoingView,
    knowledge: knowledgeList,
    numbers: numbersView,
    settings: settingsView
  };
  function draw2(enter) {
    const base = S.route.split("/")[0];
    const ups = V.watching.filter((w) => w.update).length, n = openCards().length;
    const TABS = tabsOf(V, env.snap, hasNumbers());
    $("#tabs").innerHTML = str(html`${TABS.map(([h, l, c]) => html`<a href="#${raw(h)}"${h === base ? raw(' aria-current="page"') : ""}${h === "done" && c ? html` aria-label="Done, ${c} new"` : ""}>${esc(l)}${h === "done" && c ? html`<span class="count muted">${c}</span>` : h === "focus" && n ? html`<span class="count">${n}</span>` : h === "ongoing" && ups ? html`<span class="count muted">${ups}</span>` : h === "knowledge" && V.knowledge.length ? html`<span class="count muted">${V.knowledge.length}</span>` : ""}</a>`)}${uiSwitch("menu")}`);
    const st = V.status, bad = st.state !== "on" || V.health.length || S.offline;
    $("#status").className = `pill${bad ? " warn" : ""}`;
    $("#status").innerHTML = str(html`<span class="dot" aria-hidden="true"></span><span class="pt">${esc(S.offline ? "Offline" : st.state === "on" ? `On · ${plural(st.runs, "run")} today` : st.state === "paused" ? "Paused" : "Stopped")}</span>`);
    $("#vt").textContent = env.snap ? "Snapshot" : (TABS.find((t) => t[0] === base) || TABS[0])[1];
    $("#main").innerHTML = str(env.snap ? snapshot() : (VIEWS[base] || home)(enter));
    document.title = `${env.name} · ${n} need${n === 1 ? "s" : ""} you`;
  }
  var toastT;
  function say3(t, toast) {
    const live = $("#live");
    live.textContent = "";
    setTimeout(() => {
      live.textContent = t;
    }, 30);
    if (!toast) return;
    const el = $("#toast");
    el.innerHTML = str(html`${I("check", "sm")}<span>${esc(t)}</span>`);
    el.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("show"), 4e3);
  }
  function theme2(t) {
    const b = document.getElementById("themebtn");
    if (b) {
      b.innerHTML = str(I(t === "dark" ? "moon" : t === "light" ? "sun" : "auto"));
      b.setAttribute("aria-label", `Theme: ${THEME_LABEL[t]}. Change theme`);
      b.title = `Theme: ${THEME_LABEL[t]}`;
    }
  }
  var classic = {
    boot,
    draw: draw2,
    say: say3,
    theme: theme2,
    keys: { open: () => $("#keys").showModal(), isOpen: () => $("#keys").open },
    patch: {
      primary(code, label, disabled) {
        const b = document.getElementById(`pri-${code}`);
        if (b) {
          b.querySelector(".bl").textContent = label;
          b.disabled = disabled;
        }
      },
      reminder(f) {
        $("#au-prev").innerHTML = str(formSentence(f));
      },
      // No redraw: leaving a field fires change on the way to its Save button, and a redraw would drop that click.
      unsaved(field2) {
        const row4 = field2.closest(".setrow"), b = row4?.querySelector("[data-act=saveset]");
        if (b) {
          b.disabled = false;
          b.classList.add("primary");
        }
        markUnsaved(row4?.dataset.sec);
      }
    }
  };

  // src/web/app/view/next/item.ts
  var who = (o) => o.kind === "you" ? "You" : o.kind === "delegate" ? env.name : o.kind === "others" ? o.text : "Nobody";
  var onDay = (iso) => {
    const d = new Date(iso), at = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), n = Math.round((at(/* @__PURE__ */ new Date()) - at(d)) / 864e5);
    return n <= 0 ? "today" : n === 1 ? "yesterday" : `on ${n < 7 ? d.toLocaleDateString([], { weekday: "short" }) : d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  };
  var markDone = (code, seen, named) => {
    const key = `todo:${code}`, u = peek(key);
    if (env.snap) return html`<span class="verb">${esc(`close ${code}`)}</span>`;
    return html`${u.msg ? "" : html`<div class="iacts">${B(named ? `Mark done (${code})` : "Mark done", "rowact", { sm: true, v: `close ${code}`, busy: u.status === "pending", disabled: S.offline, aria: html`data-key="${esc(key)}" data-seen="${esc(seen)}"` })}</div>`}${rowState(key)}`;
  };
  function move(r) {
    const k = r.work, todos = r.todos ?? [];
    const lines = [];
    if (k?.yours) {
      const c = k.yours.check;
      lines.push(html`<p class="iyours">${esc(k.yours.what.replace(/[.\s]+$/, ""))}.${c ? esc(` ${c.what} done ${when(c.at)} (build ${c.build})`) : ""}</p>`);
    } else if (k?.then) {
      const lead = k.then.owner.kind === "delegate" ? `${env.name}: ${k.then.what}` : `Waiting on ${who(k.then.owner)}: ${k.then.what}`;
      lines.push(html`<p class="ithen">${esc(lead)}${k.then.you ? esc(` · Then you: ${k.then.you}`) : ""}</p>`);
    }
    const codes = [...new Set(todos.map((t) => t.code))];
    if (todos.length) lines.push(html`${codes.map((code) => html`<ul class="itodos" aria-label="${esc(codes.length > 1 ? `Your to-dos on ${code}` : "Your to-dos")}">${todos.filter((t) => t.code === code).map((t) => html`<li><span class="ib" aria-hidden="true"><span class="ring"></span></span><span><b>To do:</b> ${esc(t.text)} <span class="im">${esc(`promised ${onDay(t.at)}${codes.length > 1 ? ` · ${code}` : ""}`)}</span></span></li>`)}</ul>
		${r.kind === "todo" && code === r.act ? "" : markDone(code, todos.filter((t) => t.code === code).map((t) => t.at).sort().at(-1), codes.length > 1)}`)}`);
    if (!lines.length) return "";
    return html`<section class="isec imove" aria-labelledby="im-${esc(r.act)}"><h3 id="im-${esc(r.act)}">${esc(k?.yours || todos.length ? "Your move" : "Next")}</h3>${lines}</section>`;
  }
  function checklist(r) {
    const k = r.work;
    if (!k?.steps.length) return "";
    return html`<section class="isec" aria-labelledby="ic-${esc(r.act)}"><h3 id="ic-${esc(r.act)}">Checklist</h3><ol class="icheck">${k.steps.map((s2) => html`<li class="${raw(s2.done ? "done" : s2.now ? "now" : "todo")}"${s2.now ? raw(' aria-current="step"') : ""}>
		<span class="ib" aria-hidden="true">${s2.done ? I("check", "sm") : s2.now ? I("right", "sm") : raw('<span class="ring"></span>')}</span>
		<span class="iw">${esc(s2.what)}${s2.done ? html`<span class="sr"> (done)</span>` : s2.now ? html`<span class="sr"> (current step)</span>` : ""}</span>
		<span class="io">${esc([who(s2.owner), s2.where, s2.build ? `build ${s2.build}` : ""].filter(Boolean).join(" · "))}</span></li>`)}</ol></section>`;
  }
  function report2(r) {
    const cmd = r.work?.report;
    if (!cmd) return "";
    if (env.snap) return html`<section class="isec"><h3>Report your result</h3><span class="verb">${esc(cmd.replace("{result}", RESULTS.join(" | ")).replace("{text}", "<what you saw>"))}</span></section>`;
    const u = peek(`result:${r.act}`), pick2 = u.pick?.[0], busy = peek(`row:${r.act}`).status === "pending";
    const id = (s2) => `${s2}-${r.act}`;
    return html`<section class="isec ireport" aria-labelledby="${raw(id("ir"))}"><h3 id="${raw(id("ir"))}">Report your result</h3>
		<form data-form="result" data-code="${esc(r.act)}" data-cmd="${esc(cmd)}">
		<fieldset class="ires"><legend class="sr">Result</legend>${RESULTS.map((x, i) => html`<label class="ichoice"><input type="radio" id="${raw(`res-${i}-${r.act}`)}" name="${raw(id("res"))}" data-result="${esc(r.act)}" value="${i}"${pick2 === i ? raw(" checked") : ""}${S.offline ? raw(" disabled") : ""}><span>${esc(x)}</span></label>`)}</fieldset>
		<label class="sr" for="${raw(id("saw"))}">What you saw</label><textarea id="${raw(id("saw"))}" class="edit" rows="2" data-saw="${esc(r.act)}" placeholder="What you saw: errors, IDs, links"${S.offline ? raw(" disabled") : ""}>${esc(u.answer)}</textarea>
		<div class="iacts"><button class="btn sm primary" type="submit"${pick2 == null || busy || S.offline ? raw(" disabled") : ""}><span class="bl">Draft my report</span></button><span class="im">Nothing is sent. You see the draft first.</span></div></form></section>`;
  }
  function happened(r) {
    const k = r.work;
    if (!k?.happened.length) return "";
    return html`<section class="isec" aria-labelledby="ih-${esc(r.act)}"><h3 id="ih-${esc(r.act)}">What happened, newest first${k.total > k.happened.length ? html`<span class="im">${esc(` · last ${plural(k.happened.length, "step")} of ${k.total}`)}</span>` : ""}</h3><ol class="ihist">${k.happened.map((x) => html`<li${x.news ? raw(' class="news"') : ""}><span class="im">${esc(when(x.at))}</span> ${esc(x.what)}</li>`)}</ol></section>`;
  }
  function owned(r, hasCard) {
    const inner = str(html`${move(r)}${checklist(r)}${report2(r)}${hasCard ? "" : happened(r)}`);
    return inner ? html`<div class="iown" data-code="${esc(r.act)}">${raw(inner)}</div>` : "";
  }

  // src/web/app/view/next/row.ts
  var ICON = { working: "bolt", scheduled: "clock", watch: "eye", "waiting-delegate": "clock", reminder: "clock", "reminder-new": "clock", catchup: "eye", stopped: "warn" };
  var TONE = { changed: "accent", retrying: "warn", held: "warn", worth: "accent", new: "accent", back: "accent" };
  function nextLine(r) {
    const n = r.next;
    if (!n) return "";
    const o = n.owner, w = n.what?.replace(/\s+/g, " ").trim().replace("{at}", n.at ? when(n.at) : "soon");
    if (o.kind === "others") return o.text.replace(/\s+/g, " ").trim();
    if (o.kind === "nobody") return w ?? `nobody has started this; Do it now hands it to ${env.name}`;
    if (o.kind === "you") return w ? `You: ${w}` : "You";
    if (!w) return env.name;
    return /^(after|back)\b/.test(w) ? w : `${env.name} ${w}`;
  }
  var day = (iso) => {
    const d = new Date(iso), at = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), n = Math.round((at(/* @__PURE__ */ new Date()) - at(d)) / 864e5);
    return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 7 ? d.toLocaleDateString([], { weekday: "short" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
  };
  var until = (iso) => {
    const d = new Date(iso), days = (d.getTime() - Date.now()) / 864e5;
    return `until ${days < 6.5 ? d.toLocaleDateString([], { weekday: "short" }) : d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  };
  function facts(r) {
    const f = r.facts, q = f.quote, time2 = f.verb ? `${f.verb} ${when(f.at)}` : "";
    const ownQuote = !!q && q.by === f.who && q.verb === f.verb;
    const parts = [
      // A to-do: "You promised Rita on Mon · no tool can do it" (R-NEX-07).
      ...f.promise?.to ? [esc(`You promised ${f.promise.to} ${onDay(f.promise.at)}`)] : [],
      ...f.promise?.why ? [esc(f.promise.why)] : [],
      ...f.who ? [esc(f.who)] : [],
      ...f.where ? [esc(f.where)] : [],
      ...r.when ? [esc(`starts ${when(r.when)}`)] : [],
      // One time with its verb: "asked 9:10 AM: …" for the person on the row, "You said 9:10 AM: …" for someone else.
      ...ownQuote ? [html`${esc(time2)}: <span class="nquo">"${esc(q.text)}"</span>`] : q && q.verb === f.verb ? [] : time2 ? [esc(time2)] : [],
      ...q && !ownQuote ? [html`${esc(`${q.by} ${q.verb}${q.verb === f.verb && time2 ? ` ${when(f.at)}` : ""}`)}: <span class="nquo">"${esc(q.text)}"</span>`] : [],
      ...(f.notes ?? []).map((n) => html`<span class="nl2">${esc(n.label)}${n.at ? esc(` ${when(n.at)}`) : ""}:</span> ${esc(forPage(n.text))}${n.since ? esc(` since ${day(n.since)}`) : ""}`),
      ...f.until ? [esc(until(f.until))] : [],
      ...f.also ? [esc(`+${plural(f.also, "chat")}`)] : []
    ];
    return html`<div class="nf">${join(parts, raw(" · "))}${r.teams && !env.snap ? html` <a class="ext" href="${esc(r.teams)}" target="_blank" rel="noopener" aria-label="Open in Teams">${I("ext", "sm")}</a>` : ""}</div>`;
  }
  function action(r, a, main2, open) {
    const primary2 = main2 && r.section === "move";
    const busy = U(`row:${r.act}`).status === "pending";
    if (!a.command) return env.snap ? "" : html`<a class="btn sm${primary2 && !open ? raw(" primary") : ""}" href="${open ? raw("#now") : html`#now/${esc(r.act)}`}"${open ? raw(' aria-expanded="true"') : raw(' aria-expanded="false"')}>${esc(open ? "Hide" : a.label)}</a>`;
    if (a.command.includes("{text}")) return "";
    if (env.snap) return html`<span class="verb${primary2 ? raw(" primary") : ""}">${esc(a.command)}</span>`;
    return html`<button class="btn sm${primary2 ? raw(" primary") : main2 ? "" : raw(" ghost")}" data-act="nact" data-v="${esc(a.command)}"${busy || primary2 && S.offline ? raw(" disabled") : ""}><span class="bl">${esc(a.label)}</span></button>`;
  }
  function tell(r) {
    const a = r.primary;
    if (!a?.command?.includes("{text}") || env.snap) return a?.command?.includes("{text}") ? html`<span class="verb">${esc(a.command.replace("{text}", "<what you did>"))}</span>` : "";
    const u = U(`tell:${r.act}`);
    return html`<form class="ntell" data-form="tell" data-code="${esc(r.act)}" data-cmd="${esc(a.command)}" aria-label="${esc(a.label)}"><label class="sr" for="tell-${esc(r.act)}">What you did or found, for ${esc(env.name)}</label><input id="tell-${esc(r.act)}" data-tell="${esc(r.act)}" placeholder="Tell ${esc(env.name)} what you did, or what to do next" autocomplete="off" value="${esc(u.answer)}"${S.offline ? raw(" disabled") : ""}><button class="btn sm primary" type="submit"${!u.answer.trim() || S.offline ? raw(" disabled") : ""}>${esc(a.label)}</button></form>`;
  }
  function ncard(r, c) {
    const own = owned(r, !!c);
    if (c) return html`${own ? html`<div class="ncard">${own}</div>` : ""}<div class="ncard">${card(c, false, { work: !own })}</div>`;
    if (own) return html`<div class="ncard">${own}</div>`;
    return html`<p class="m ncard">${esc(`${r.act} has no card to open here.`)}${r.teams ? html` <a href="${esc(r.teams)}" target="_blank" rel="noopener">Open in Teams</a>` : ""}</p>`;
  }
  function row3(r, open) {
    const c = open ? cardOf(r.act) : void 0, icon = ICON[r.kind];
    const lead = r.who && !icon ? av(r.who) : html`<span class="ri">${I(icon ?? "clock")}</span>`;
    const fresh = env.snap ? void 0 : freshOf(r, S.nowLook?.[r.act] ?? rowMark(V, r));
    const chips = [...fresh ? [{ kind: fresh, text: FRESH_TEXT[fresh] }] : [], ...r.chips].map((ch) => html`<span class="tag ${raw(TONE[ch.kind] ?? "")}${ch.kind === "new" || ch.kind === "back" ? raw(` fresh-${ch.kind}`) : ""}">${esc(ch.text)}</span>`);
    const nx = nextLine(r);
    const ru = U(`row:${r.act}`);
    if (ru.msg && ru.status !== "pending" && ru.rev !== void 0 && r.rev !== ru.rev) Object.assign(ru, { msg: "", rev: void 0 });
    const acts = ru.msg ? "" : html`${r.primary ? action(r, r.primary, true, open) : ""}${(r.more ?? []).map((m) => action(r, m, false, false))}`;
    return html`<li class="nrow k-${raw(r.kind)}${open ? raw(" open") : ""}" id="now-${esc(r.act)}" data-code="${esc(r.act)}"${r.rev ? html` data-rev="${esc(r.rev)}"` : ""}>
		<div class="nmain">${lead}<div class="nrbody">
			<div class="nh"><b class="nt">${esc(forPage(r.headline))}</b>${chips}<span class="code">${esc(r.act)}</span></div>
			${facts(r)}
			${r.draft ? html`<blockquote class="nd">${esc(r.draft)}</blockquote>` : ""}${r.gist ? html`<p class="ng">${esc(r.gist)}</p>` : ""}
			${r.warn ? html`<div class="nwarn">${I("warn", "sm")}<span>${esc(r.warn)}</span></div>` : ""}
			${nx ? html`<div class="nn"><span>Next: ${esc(nx)}</span></div>` : ""}
			${open && r.work?.report ? "" : tell(r)}${rowState(`row:${r.act}`)}
		</div>${acts ? html`<div class="nract">${acts}</div>` : ""}</div>
		${open ? ncard(r, c) : ""}
	</li>`;
  }

  // src/web/app/view/next/now.ts
  function section(id, title, count, rows2, extra = "", empty = "", foot = "") {
    if (id !== "move" && !rows2.length) return "";
    const [, sub] = S.route.split("/"), shown = rows2.find((r) => r.act === sub || r.code === sub), open = id === "move" || sub === id || !!shown;
    return html`<section class="nsec${open ? raw(" open") : ""}" id="now-${raw(id)}" aria-labelledby="nh-${raw(id)}">
		<div class="nsh"><h2 id="nh-${raw(id)}">${esc(title)}<span class="nc">&nbsp;· ${esc(count)}</span></h2><span class="sp"></span>${extra}</div>
		${rows2.length ? html`<ul class="nrows">${rows2.map((r) => row3(r, r === shown))}</ul>` : empty}${foot}</section>`;
  }
  function summary() {
    const n = V.next, changed = n.waiting.filter((r) => r.chips.some((c) => c.kind === "changed")).length;
    const sep = raw('<span class="sep" aria-hidden="true"> · </span>');
    const part2 = (id, text2) => html`<a href="#now/${raw(id)}">${esc(text2)}</a>`;
    const since = sinceOf(V);
    const lead = since.parts.length ? html`<span class="nsince"><span class="nsl">${esc(`Since ${when(since.at)}:`)}</span> ${join(since.parts.map((p) => html`<a href="${esc(p.href)}">${esc(p.text)}${p.href === "#numbers" ? raw('<span aria-hidden="true"> ›</span>') : ""}</a>`), sep)}</span>${sep}` : "";
    return html`<p class="nsum" id="nsum">${n.off && !n.paused ? html`<span class="tag warn">${esc(n.off.since ? `${n.off.text} since ${when(n.off.since)}` : n.off.text)}</span>` : ""}${lead}${join([
      part2("working", `${env.name} is working on ${n.working.length}`),
      part2("waiting", `Waiting ${n.waiting.length}${changed ? `, ${changed} changed` : ""}`),
      part2("catchup", `Catch up ${n.catchup.count}${n.catchup.worth ? `, ${n.catchup.worth} worth a look` : ""}`)
    ], sep)}</p>`;
  }
  function undoStrip() {
    const open = (V.done ?? []).filter((r) => r.undoUntil && Date.parse(r.undoUntil) > Date.now());
    return html`${open.map((r) => {
      const rule = /by rule (\S+)/.exec(r.by)?.[1], left = Math.max(0, Math.round((Date.parse(r.undoUntil) - Date.now()) / 1e3));
      return html`<div class="nundo" data-code="${esc(r.code)}" role="status"><p>${esc(rule ? `Sent for you to ${first(r.who.name)} (rule ${rule})` : `Sent to ${first(r.who.name)}`)}${r.said ? html`<span class="nsaid">: <span class="nquo">"${esc(r.said)}"</span></span>` : ""}</p>${env.snap ? "" : html`<button class="btn sm" data-act="undo" data-v="${esc(r.code)}"${U(`row:${r.code}`).status === "pending" ? raw(" disabled") : ""}>${I("undo", "sm")}<span class="bl">Undo <span data-until="${esc(r.undoUntil)}">${esc(mmss(left))}</span></span></button>`}${rowState(`row:${r.code}`)}</div>`;
    })}`;
  }
  function footer() {
    if (env.snap) return "";
    const v = V.version, chans = V.channels ?? [];
    const channels = chans.length ? html`<details class="nchan" data-chan${S.chanOpen ? raw(" open") : ""}><summary>${esc(`Channels you named (${chans.length})`)}</summary><ul>${chans.map((c, i) => html`<li>${esc(c.name)} ${U(`row:ch${i}`).msg ? "" : B("Stop", "rowact", { sm: true, ghost: true, v: `unwatch ${c.link}`, verb: `unwatch ${c.link}`, aria: html`data-key="row:ch${i}"` })}${rowState(`row:ch${i}`)}</li>`)}</ul></details>` : "";
    const ver = v?.code ? esc(`Version ${v.tag ? `${v.tag} (${v.code})` : v.code}`) : "";
    const report3 = S.reporting ? html`<form class="markf missf" data-form="report" aria-label="Report a problem"><label class="sr" for="repin">What went wrong</label><textarea id="repin" class="edit" rows="3" placeholder="What went wrong, and what should it have done?"></textarea><div class="markacts"><button class="btn sm primary" type="submit"${S.offline ? raw(" disabled") : ""}>Send to the feedback log</button>${B("Cancel", "reportcancel", { sm: true, ghost: true })}</div></form>` : "";
    return html`<footer class="nfoot" aria-label="More"><div class="nfl">${join([
      B("+ Remind someone", "tpl", { sm: true, ghost: true, v: "remind" }),
      channels,
      ver,
      B(S.checking ? "Checking…" : "Check for updates", "checkupdate", { sm: true, ghost: true, busy: S.checking }),
      B("Report a problem", "reportopen", { sm: true, ghost: true })
    ].filter((x) => !!x), raw('<span class="sep" aria-hidden="true"> · </span>'))}</div>${report3}</footer>${S.sheet ? sheet() : ""}`;
  }
  function findBox() {
    if (env.snap) return "";
    return html`<form class="nfind" data-form="find" role="search" aria-label="Find"><label class="sr" for="find">Find a person, chat, PR or number, or paste a Teams link</label><input id="find" type="search" placeholder="Find a person, a number, or paste a Teams link" autocomplete="off" spellcheck="false" value="${esc(S.find ?? "")}"><kbd class="nk" aria-hidden="true">/</kbd></form>`;
  }
  function found() {
    const q = (S.find ?? "").trim(), f = find(V, q);
    const make = f.link && !f.link.item ? html`<div class="nfl-make" role="group" aria-label="Not an item yet"><p>${esc(`This message is not an item yet. ${env.name} reads it and drafts what it needs, as for any ask.`)}</p><button class="btn sm primary" type="button" data-act="findmissed"${S.offline || S.missing ? raw(" disabled") : ""}><span class="bl">${esc(S.missing ? "Making it an item…" : "Make it an item")}</span></button></div>` : "";
    const n = f.now.length + f.done.length;
    const head2 = n ? join([f.now.length ? `${f.now.length} on Now` : "", f.done.length ? `${f.done.length} in Done` : ""].filter(Boolean).map((x) => esc(x)), raw(" · ")) : f.link ? "" : esc(`Nothing on Now or in Done matches "${q}".`);
    return html`<div class="nfound" id="nfound">${head2 ? html`<p class="nfres" role="status">${head2}</p>` : ""}${make}
		${f.now.length ? html`<ul class="nrows">${f.now.map((r) => row3(r, false))}</ul>` : ""}
		${f.done.length ? html`<h2 class="section-h">In Done</h2><ul class="rows">${f.done.map(row)}</ul>` : ""}</div>`;
  }
  function nowView() {
    const n = V.next;
    if (!n) return html`${banners()}<p class="empty" role="status">Loading…</p>`;
    const waiting = n.waiting.length;
    const note = env.snap || env.ui !== "new" || V.ui?.noted ? "" : html`<div class="nnote" role="note"><p>Same items, sorted by whose move it is<span class="wide">: yours, someone else's, or ${esc(env.name)}'s</span>. Switch back any time, <span class="wide">top right</span><span class="narrow">in ⋯</span>.</p>${B("Got it", "uinote", { sm: true, ghost: true })}</div>`;
    if (S.find?.trim()) return html`${banners()}${findBox()}${undoStrip()}${found()}${footer()}`;
    if (!n.move.length && !waiting && !n.working.length && !n.catchup.count && !n.minute.facts && !n.minute.suggestions) return html`${banners()}${findBox()}${undoStrip()}${note}<div class="nquiet"><span class="ok">${I("check", "lg")}</span><h2>Quiet.</h2><p>Nothing needs you, and nothing is waiting.</p></div>${footer()}`;
    const minute = n.minute.facts || n.minute.suggestions ? html`<p class="nmin">When you have a minute: ${n.minute.suggestions ? html`<a href="#settings/learned">${esc(plural(n.minute.suggestions, "suggestion"))}</a>` : ""}${n.minute.facts && n.minute.suggestions ? raw(" · ") : ""}${n.minute.facts ? html`<a href="#knowledge">${esc(`${plural(n.minute.facts, "fact")} to check`)}</a>` : ""}</p>` : "";
    const offHead = n.off ? html`<span class="tag warn">${esc(n.off.since ? `${n.off.text} since ${when(n.off.since)}` : n.off.text)}</span>` : "";
    const more = n.catchup.count - n.catchup.rows.length, others = waiting + n.working.length;
    return html`${banners()}${findBox()}${summary()}${undoStrip()}${note}
		${section("move", "Your move", String(n.move.length), n.move, "", html`<p class="nempty">Nothing needs you. ${esc(others ? `${plural(others, "thing")} ${others === 1 ? "is" : "are"} waiting on someone else.` : "Nothing is waiting either.")}</p>`, minute)}
		${section("working", `${env.name} is working`, String(n.working.length), n.working, offHead)}
		${section("waiting", "Waiting", String(waiting), n.waiting)}
		${section("catchup", "Catch up", `${n.catchup.count} unread`, n.catchup.rows, n.catchup.count && !env.snap ? B("Mark all read", "seenall", { sm: true, ghost: true, v: "catchup" }) : "", "", more > 0 ? html`<a class="nmore" href="#done/catchup">+ ${more} more ${I("right", "sm")}</a>` : "")}
		${footer()}`;
  }

  // src/web/app/view/next/index.ts
  var $2 = (s2) => document.querySelector(s2);
  var KEYS = [["Now", "g h"], ["Undo the last automatic reply", "u"], ["Leave a field", "Esc"], ["This list", "?"]];
  function boot2(app) {
    document.body.insertAdjacentHTML("afterbegin", str(html`${sprite}<a class="skip" href="#main">Skip to content</a>`));
    app.dataset.ui = "next";
    app.innerHTML = str(html`<header class="top" role="banner"><div class="top-in">
	<a class="brand" href="#now" aria-label="${esc(env.name)}, Now"><span class="mark"><svg class="i" aria-hidden="true" style="width:17px;height:17px"><use href="#i-logo"/></svg></span><span class="bn">${esc(env.name)}</span></a>
	<nav class="tabs" id="tabs" aria-label="Views"></nav><span class="vt" id="vt"></span><span class="pill" id="status"></span>${uiSwitch("top")}<button class="btn ghost icon" id="themebtn" data-act="theme"></button>
	<button class="btn ghost icon navbtn" id="navbtn" aria-expanded="false" aria-controls="tabs" aria-label="Menu">${I("more")}</button></div></header><main id="main" tabindex="-1"></main>`);
    document.body.insertAdjacentHTML("beforeend", str(html`<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div><div class="sr" id="live" aria-live="polite" aria-atomic="true"></div>
	<dialog id="keys" aria-labelledby="keys-h"><div class="sheet-h"><h2 id="keys-h">Keyboard</h2><button class="btn ghost icon sm" data-close aria-label="Close">${I("x")}</button></div><div class="sheet-b"><table class="keys"><tbody>
	${KEYS.map(([a, k]) => html`<tr><td>${esc(a)}</td><td>${raw(k.split(" ").map((x) => str(kbd(x))).join(" "))}</td></tr>`)}
	</tbody></table></div></dialog>`));
    $2("#keys [data-close]").addEventListener("click", () => $2("#keys").close());
    $2("#navbtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const o = !$2("#tabs").classList.contains("open");
      $2("#tabs").classList.toggle("open", o);
      $2("#navbtn").setAttribute("aria-expanded", String(o));
    });
    $2("#tabs").addEventListener("click", () => {
      $2("#tabs").classList.remove("open");
      $2("#navbtn").setAttribute("aria-expanded", "false");
    });
  }
  function tabs(base) {
    const n = V.next?.move.length ?? 0, d = newCount(V);
    const tab = (h, label, count) => html`<a href="#${raw(h)}"${h === base ? raw(' aria-current="page"') : ""}>${esc(label)}${count}</a>`;
    const t = theme();
    return html`${tab("now", "Now", n ? html`<span class="count">${n}</span>` : "")}${tab("done", "Done", d ? html`<span class="count muted" aria-label="${d} new">${d}</span>` : "")}${hasNumbers() ? tab("numbers", "Numbers", "") : ""}${V.settings ? tab("settings", "Settings", "") : ""}${uiSwitch("menu")}<button class="menu-only themeitem" type="button" data-act="theme">${I(t === "dark" ? "moon" : t === "light" ? "sun" : "auto")}<span>Theme: ${esc(THEME_LABEL[t])}</span></button>`;
  }
  function status() {
    if (S.offline) return "Offline";
    const st = V.status, r = st.reading;
    if (st.state !== "on") return st.state === "paused" ? "Paused" : "Stopped";
    if (r.state === "never") return "Not checked yet";
    return r.state === "off" ? `Not checked since ${when(r.at)}` : `Checked ${when(r.at)}`;
  }
  var VIEWS2 = { now: nowView, done: () => doneList(S.route.split("/")[1] || "all"), numbers: numbersView, settings: settingsView, knowledge: knowledgeList };
  var LABEL = { now: "Now", done: "Done", numbers: "Numbers", settings: "Settings", knowledge: "To learn" };
  function draw3() {
    const base = VIEWS2[S.route.split("/")[0]] ? S.route.split("/")[0] : "now";
    $2("#tabs").innerHTML = str(tabs(base));
    const d = newCount(V);
    $2("#navbtn").innerHTML = str(html`${I("more")}${d ? html`<span class="count muted">${d}</span>` : ""}`);
    $2("#navbtn").setAttribute("aria-label", d ? `Menu, ${d} new in Done` : "Menu");
    const bad = V.status.state !== "on" || V.health.length || S.offline || V.status.reading.state === "off" || V.status.reading.state === "never";
    $2("#status").className = `pill${bad ? " warn" : ""}`;
    $2("#status").innerHTML = str(html`<span class="dot" aria-hidden="true"></span><span class="pt">${esc(status())}</span>`);
    $2("#vt").textContent = LABEL[base];
    $2("#main").innerHTML = str(VIEWS2[base]());
    const n = V.next?.move.length ?? 0;
    document.title = `${env.name} · ${n ? `${n} your move` : "Now"}`;
  }
  var toastT2;
  function say4(t, toast) {
    const live = $2("#live");
    live.textContent = "";
    setTimeout(() => {
      live.textContent = t;
    }, 30);
    if (!toast) return;
    const el = $2("#toast");
    el.innerHTML = str(html`${I("check", "sm")}<span>${esc(t)}</span>`);
    el.classList.add("show");
    clearTimeout(toastT2);
    toastT2 = setTimeout(() => el.classList.remove("show"), 4e3);
  }
  function theme3(t) {
    const b = document.getElementById("themebtn");
    if (b) {
      b.innerHTML = str(I(t === "dark" ? "moon" : t === "light" ? "sun" : "auto"));
      b.setAttribute("aria-label", `Theme: ${THEME_LABEL[t]}. Change theme`);
      b.title = `Theme: ${THEME_LABEL[t]}`;
    }
    const m = document.querySelector("#tabs .themeitem span");
    if (m) m.textContent = `Theme: ${THEME_LABEL[t]}`;
  }
  var next = {
    boot: boot2,
    draw: draw3,
    say: say4,
    theme: theme3,
    alias: newRoute,
    keys: { open: () => $2("#keys").showModal(), isOpen: () => $2("#keys").open },
    patch: {
      primary(code, label, disabled) {
        const b = document.getElementById(`pri-${code}`);
        if (b) {
          b.querySelector(".bl").textContent = label;
          b.disabled = disabled;
        }
      },
      reminder(f) {
        const p = document.getElementById("au-prev");
        if (p) p.innerHTML = str(formSentence(f));
      },
      unsaved(field2) {
        const row4 = field2.closest(".setrow"), b = row4?.querySelector("[data-act=saveset]");
        if (b) {
          b.disabled = false;
          b.classList.add("primary");
        }
        markUnsaved(row4?.dataset.sec);
      }
    }
  };

  // src/web/app/app.ts
  var EXPERIENCES = { classic, new: next };
  void (async () => {
    init(window.DELEGATE, window.DELEGATE_IO, window.DELEGATE_POLL_MS || 2e3);
    const chosen = await chooseUi(), exp2 = EXPERIENCES[chosen.ui];
    start(exp2);
    exp2.boot(document.getElementById("app"));
    syncOrder();
    if (!env.snap) listen();
    setTheme(theme());
    route();
    if (chosen.failed) say2("Could not switch: offline");
    if (env.ui === "new" && !V.next) void refresh();
  })();
})();
