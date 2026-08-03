/**
 * Format date for display in the UI
 * @param date - The date to format
 * @returns Formatted date string (e.g., "Aug 2, 2026")
 */
export function formatDisplayDate(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format time for display in the UI
 * @param date - The date to format
 * @returns Formatted time string (e.g., "19:05")
 */
export function formatDisplayTime(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid Time';
  }
  
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Format date and time for display in the UI
 * @param date - The date to format
 * @returns Formatted date and time string (e.g., "Aug 2, 2026 19:05")
 */
export function formatDisplayDateTime(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  return `${formatDisplayDate(date)} ${formatDisplayTime(date)}`;
}