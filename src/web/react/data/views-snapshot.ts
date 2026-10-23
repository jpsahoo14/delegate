// The views of the saved read-only snapshot (scripts/build.ts uses this file in place of views.ts for that build only).
// A snapshot draws only Classic's snapshot screen and never navigates, so no other view's code is bundled into it.
const none = () => Promise.resolve({ default: () => null })

export const NEW_VIEWS = { now: none, done: none, numbers: none, settings: none, knowledge: none }
export const CLASSIC_VIEWS = { app: none, done: none, numbers: none, settings: none, knowledge: none }
export const warmExperience = (_classic: boolean) => Promise.resolve([])
export const experienceReady = (_classic: boolean) => true
