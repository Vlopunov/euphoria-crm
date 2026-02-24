// Helper to get date string in Minsk timezone (UTC+3)
// Uses sv-SE locale which formats as YYYY-MM-DD
function toMinskDate(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Minsk' });
}

module.exports = { toMinskDate };
