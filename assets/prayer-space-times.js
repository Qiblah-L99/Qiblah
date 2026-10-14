function normalisePrayerSpaceJummahTimes(values) {
  if (!Array.isArray(values)) return [];
  var times = values.map(function(value) {
    var match = String(value || '').trim().match(/^(\d{1,2}):([0-5]\d)(?::00)?(?:\s*(AM|PM))?$/i);
    if (!match) return '';
    var hour = Number(match[1]);
    if (match[3]) {
      if (hour < 1 || hour > 12) return '';
      hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    } else if (hour > 23) return '';
    return String(hour).padStart(2, '0') + ':' + match[2];
  }).filter(Boolean);
  return Array.from(new Set(times)).sort().slice(0, 3);
}
