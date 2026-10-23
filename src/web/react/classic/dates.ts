export const deadlineChoices = [['', 'No date'], ['today', 'Today'], ['fri', 'Friday'], ['week', 'Next week']] as const

export function deadlineDate(choice: string) {
	const date = new Date()
	if (choice === 'fri') date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7 || 7))
	else if (choice === 'week') date.setDate(date.getDate() + 7)
	else if (choice !== 'today') return ''
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
