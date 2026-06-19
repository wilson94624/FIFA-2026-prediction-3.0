export const TEAM_TRANSLATIONS = {
  'Argentina': { cn: '阿根廷', flag: '🇦🇷' },
  'Australia': { cn: '澳洲', flag: '🇦🇺' },
  'Algeria': { cn: '阿爾及利亞', flag: '🇩🇿' },
  'Austria': { cn: '奧地利', flag: '🇦🇹' },
  'Belgium': { cn: '比利時', flag: '🇧🇪' },
  'Brazil': { cn: '巴西', flag: '🇧🇷' },
  'Canada': { cn: '加拿大', flag: '🇨🇦' },
  'Colombia': { cn: '哥倫比亞', flag: '🇨🇴' },
  'Congo DR': { cn: '剛果民主共和國', flag: '🇨🇩' },
  'Croatia': { cn: '克羅埃西亞', flag: '🇭🇷' },
  'Curacao': { cn: '庫拉索', flag: '🇨🇼' },
  'Curaçao': { cn: '庫拉索', flag: '🇨🇼' },
  'Ecuador': { cn: '厄瓜多', flag: '🇪🇨' },
  'Egypt': { cn: '埃及', flag: '🇪🇬' },
  'England': { cn: '英格蘭', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  'France': { cn: '法國', flag: '🇫🇷' },
  'Germany': { cn: '德國', flag: '🇩🇪' },
  'Ghana': { cn: '迦納', flag: '🇬🇭' },
  'Haiti': { cn: '海地', flag: '🇭🇹' },
  'Iran': { cn: '伊朗', flag: '🇮🇷' },
  'Iraq': { cn: '伊拉克', flag: '🇮🇶' },
  'Ivory Coast': { cn: '象牙海岸', flag: '🇨🇮' },
  'Japan': { cn: '日本', flag: '🇯🇵' },
  'Jordan': { cn: '約旦', flag: '🇯🇴' },
  'Mexico': { cn: '墨西哥', flag: '🇲🇽' },
  'Morocco': { cn: '摩洛哥', flag: '🇲🇦' },
  'Netherlands': { cn: '荷蘭', flag: '🇳🇱' },
  'New Zealand': { cn: '紐西蘭', flag: '🇳🇿' },
  'Norway': { cn: '挪威', flag: '🇳🇴' },
  'Panama': { cn: '巴拿馬', flag: '🇵🇦' },
  'Paraguay': { cn: '巴拉圭', flag: '🇵🇾' },
  'Portugal': { cn: '葡萄牙', flag: '🇵🇹' },
  'Qatar': { cn: '卡達', flag: '🇶🇦' },
  'Saudi Arabia': { cn: '沙烏地阿拉伯', flag: '🇸🇦' },
  'Scotland': { cn: '蘇格蘭', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  'Senegal': { cn: '塞內加爾', flag: '🇸🇳' },
  'South Africa': { cn: '南非', flag: '🇿🇦' },
  'South Korea': { cn: '南韓', flag: '🇰🇷' },
  'Spain': { cn: '西班牙', flag: '🇪🇸' },
  'Sweden': { cn: '瑞典', flag: '🇸🇪' },
  'Switzerland': { cn: '瑞士', flag: '🇨🇭' },
  'Tunisia': { cn: '突尼西亞', flag: '🇹🇳' },
  'Turkey': { cn: '土耳其', flag: '🇹🇷' },
  'Uruguay': { cn: '烏拉圭', flag: '🇺🇾' },
  'USA': { cn: '美國', flag: '🇺🇸' },
  'Uzbekistan': { cn: '烏茲別克', flag: '🇺🇿' },
  'Cabo Verde': { cn: '維德角', flag: '🇨🇻' },
  'Bosnia and Herzegovina': { cn: '波赫', flag: '🇧🇦' },
  'Czechia': { cn: '捷克', flag: '🇨🇿' }
};

const taiwanFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const formatParts = (date) => {
  const parts = Object.fromEntries(
    taiwanFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
};

export const formatTaiwanTime = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : formatParts(date);
};

export const toTaiwanTime = (localDateStr) => {
  if (!localDateStr) return '';
  const match = String(localDateStr).match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return formatTaiwanTime(localDateStr);
  const [, month, day, year, hour, minute] = match;
  return formatTaiwanTime(`${year}-${month}-${day}T${hour}:${minute}:00-04:00`);
};
