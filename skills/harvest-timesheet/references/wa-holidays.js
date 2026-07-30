// Washington State legal holidays (RCW 1.16.050), with observed-day shifting.
// isWaHoliday(date) -> holiday name string, or null.
// Observance: fixed-date holiday on Saturday -> observed preceding Friday;
// on Sunday -> observed following Monday.

function nthWeekday(year, month, weekday, n) { // month 0-11, weekday 0=Sun
  const d = new Date(year, month, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === weekday && ++count === n) return new Date(d);
    d.setDate(d.getDate() + 1);
  }
}
function lastWeekday(year, month, weekday) {
  const d = new Date(year, month + 1, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return d;
}
function observed(year, month, day) { // fixed-date holidays only
  const d = new Date(year, month, day);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1); // Sat -> Fri
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Sun -> Mon
  return d;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function waHolidays(year) {
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const dayAfter = new Date(thanksgiving); dayAfter.setDate(dayAfter.getDate() + 1);
  return [
    ["New Year's Day", observed(year, 0, 1)],
    ["Martin Luther King Jr. Day", nthWeekday(year, 0, 1, 3)],
    ["Presidents' Day", nthWeekday(year, 1, 1, 3)],
    ["Memorial Day", lastWeekday(year, 4, 1)],
    ["Juneteenth", observed(year, 5, 19)],
    ["Independence Day", observed(year, 6, 4)],
    ["Labor Day", nthWeekday(year, 8, 1, 1)],
    ["Veterans Day", observed(year, 10, 11)],
    ["Thanksgiving Day", thanksgiving],
    ["Native American Heritage Day", dayAfter],
    ["Christmas Day", observed(year, 11, 25)],
  ];
}

function isWaHoliday(date) {
  const d = date instanceof Date ? date : new Date(date + "T12:00:00");
  for (const [name, hd] of waHolidays(d.getFullYear())) if (sameDay(d, hd)) return name;
  return null;
}

if (typeof module !== "undefined") module.exports = { isWaHoliday, waHolidays };
