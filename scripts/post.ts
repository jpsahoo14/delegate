// Dev helper: post a message to a chat as the owner, for dry runs and tests. Usage: node scripts/post.ts <chatId|self> <text>
import { TeamsSource } from '../src/adapters/source-teams.ts'
import { Store, loadLocal } from '../src/store/state.ts'

const [chatId, ...words] = process.argv.slice(2)
const src = new TeamsSource(new Store(loadLocal()).config().source)
const r = chatId === 'self' ? await src.sendSelf(words.join(' ')) : await src.send(chatId, words.join(' '))
console.log(JSON.stringify(r))
await src.close()
