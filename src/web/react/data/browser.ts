import { useState } from 'react'
import { editInChat } from '../services/browser.ts'

export function useEditInChat() {
	const [message, setMessage] = useState<string>()
	return { message, open: async (text: string, link: string) => {
		try {
			await editInChat(text, link)
			setMessage('Reply copied and chat opened. Paste it there, edit it and send it yourself. Nothing was sent by this page.')
		} catch (error) {
			console.error('Could not copy the reply:', error)
			setMessage('Could not copy the reply. Select the visible reply and copy it, then open the chat link.')
		}
	} }
}
