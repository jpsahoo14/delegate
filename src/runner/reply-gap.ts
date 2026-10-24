import { stateFields, statusFields } from '../core/upgrades.ts'
import { REPLY_BLANK, replyGap } from '../core/policy.ts'
import type { Workflow } from '../core/types.ts'
import type { Store } from '../store/state.ts'

export function holdReplyGap(store: Store, item: Workflow, text: string | undefined, automatic = false): boolean {
	if (!replyGap(text)) return false
	Object.assign(item, { ...stateFields(item, 'needs_human'), approved: undefined, sendAt: undefined, ...statusFields('not-sent', `Not sent: ${REPLY_BLANK}`), question: item.question || 'What goes in the blank?' })
	store.save(item)
	store.log({ event: automatic ? 'rule-held-gap' : 'reply-held-gap', code: item.code, workflowId: item.id, reason: REPLY_BLANK })
	return true
}
