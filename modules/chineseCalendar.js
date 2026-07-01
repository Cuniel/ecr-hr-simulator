const HOLIDAY_DATA = {
  '2026': {
    holidays: {
      '2026-01-01': '元旦',
      '2026-01-02': '元旦假期',
      '2026-01-03': '元旦假期',
      '2026-02-15': '春节假期',
      '2026-02-16': '除夕',
      '2026-02-17': '春节',
      '2026-02-18': '春节假期',
      '2026-02-19': '春节假期',
      '2026-02-20': '春节假期',
      '2026-02-21': '春节假期',
      '2026-02-22': '春节假期',
      '2026-02-23': '春节假期',
      '2026-04-05': '清明节',
      '2026-04-06': '清明节假期',
      '2026-05-01': '劳动节',
      '2026-05-02': '劳动节假期',
      '2026-05-03': '劳动节假期',
      '2026-05-04': '劳动节假期',
      '2026-05-05': '劳动节假期',
      '2026-06-19': '端午节',
      '2026-06-20': '端午节假期',
      '2026-06-21': '端午节假期',
      '2026-09-25': '中秋节',
      '2026-09-26': '中秋节假期',
      '2026-09-27': '中秋节假期',
      '2026-10-01': '国庆节',
      '2026-10-02': '国庆节假期',
      '2026-10-03': '国庆节假期',
      '2026-10-04': '国庆节假期',
      '2026-10-05': '国庆节假期',
      '2026-10-06': '国庆节假期',
      '2026-10-07': '国庆节假期'
    },
    workdays: {
      '2026-01-04': '元旦调休上班',
      '2026-02-14': '春节调休上班',
      '2026-02-28': '春节调休上班',
      '2026-05-09': '劳动节调休上班',
      '2026-10-10': '国庆节调休上班'
    }
  }
};

function formatDate(date = new Date(), timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseLocalDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

function getDayType(dateInput = new Date()) {
  const dateString = dateInput instanceof Date ? formatDate(dateInput) : dateInput;
  const date = parseLocalDate(dateString);

  if (!date) {
    throw new Error('日期格式必须是 YYYY-MM-DD');
  }

  const yearData = HOLIDAY_DATA[String(date.getFullYear())] || { holidays: {}, workdays: {} };
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (yearData.workdays[dateString]) {
    return {
      date: dateString,
      isWorkday: true,
      isHoliday: false,
      isWeekend,
      source: 'adjusted-workday',
      name: yearData.workdays[dateString]
    };
  }

  if (yearData.holidays[dateString]) {
    return {
      date: dateString,
      isWorkday: false,
      isHoliday: true,
      isWeekend,
      source: 'holiday',
      name: yearData.holidays[dateString]
    };
  }

  return {
    date: dateString,
    isWorkday: !isWeekend,
    isHoliday: false,
    isWeekend,
    source: isWeekend ? 'weekend' : 'weekday',
    name: isWeekend ? '周末' : '普通工作日'
  };
}

module.exports = {
  getDayType,
  formatDate
};
