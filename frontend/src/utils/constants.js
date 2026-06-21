export const TEAM_TRANSLATIONS = {
  Argentina: { cn: '阿根廷', code: 'ar' },
  Australia: { cn: '澳洲', code: 'au' },
  Algeria: { cn: '阿爾及利亞', code: 'dz' },
  Austria: { cn: '奧地利', code: 'at' },
  Belgium: { cn: '比利時', code: 'be' },
  Brazil: { cn: '巴西', code: 'br' },
  Canada: { cn: '加拿大', code: 'ca' },
  Colombia: { cn: '哥倫比亞', code: 'co' },
  'Congo DR': { cn: '剛果民主共和國', code: 'cd' },
  'DR Congo': { cn: '剛果民主共和國', code: 'cd' },
  'Democratic Republic of the Congo': { cn: '剛果民主共和國', code: 'cd' },
  Croatia: { cn: '克羅埃西亞', code: 'hr' },
  Curacao: { cn: '庫拉索', code: 'cw' },
  Curaçao: { cn: '庫拉索', code: 'cw' },
  Ecuador: { cn: '厄瓜多', code: 'ec' },
  Egypt: { cn: '埃及', code: 'eg' },
  England: { cn: '英格蘭', code: 'gb-eng' },
  Scotland: { cn: '蘇格蘭', code: 'gb-sct' },
  Wales: { cn: '威爾斯', code: 'gb-wls' },
  'Northern Ireland': { cn: '北愛爾蘭', code: 'gb-nir' },
  France: { cn: '法國', code: 'fr' },
  Germany: { cn: '德國', code: 'de' },
  Ghana: { cn: '迦納', code: 'gh' },
  Haiti: { cn: '海地', code: 'ht' },
  Iran: { cn: '伊朗', code: 'ir' },
  Iraq: { cn: '伊拉克', code: 'iq' },
  'Ivory Coast': { cn: '象牙海岸', code: 'ci' },
  "Côte d'Ivoire": { cn: '象牙海岸', code: 'ci' },
  Japan: { cn: '日本', code: 'jp' },
  Jordan: { cn: '約旦', code: 'jo' },
  Mexico: { cn: '墨西哥', code: 'mx' },
  Morocco: { cn: '摩洛哥', code: 'ma' },
  Netherlands: { cn: '荷蘭', code: 'nl' },
  'New Zealand': { cn: '紐西蘭', code: 'nz' },
  Norway: { cn: '挪威', code: 'no' },
  Panama: { cn: '巴拿馬', code: 'pa' },
  Paraguay: { cn: '巴拉圭', code: 'py' },
  Portugal: { cn: '葡萄牙', code: 'pt' },
  Qatar: { cn: '卡達', code: 'qa' },
  'Saudi Arabia': { cn: '沙烏地阿拉伯', code: 'sa' },
  Senegal: { cn: '塞內加爾', code: 'sn' },
  'South Africa': { cn: '南非', code: 'za' },
  'South Korea': { cn: '南韓', code: 'kr' },
  'Korea Republic': { cn: '南韓', code: 'kr' },
  Spain: { cn: '西班牙', code: 'es' },
  Sweden: { cn: '瑞典', code: 'se' },
  Switzerland: { cn: '瑞士', code: 'ch' },
  Tunisia: { cn: '突尼西亞', code: 'tn' },
  Turkey: { cn: '土耳其', code: 'tr' },
  Türkiye: { cn: '土耳其', code: 'tr' },
  Uruguay: { cn: '烏拉圭', code: 'uy' },
  USA: { cn: '美國', code: 'us' },
  'United States': { cn: '美國', code: 'us' },
  Uzbekistan: { cn: '烏茲別克', code: 'uz' },
  'Cabo Verde': { cn: '維德角', code: 'cv' },
  'Cape Verde': { cn: '維德角', code: 'cv' },
  'Bosnia and Herzegovina': { cn: '波赫', code: 'ba' },
  Czechia: { cn: '捷克', code: 'cz' },
  'Czech Republic': { cn: '捷克', code: 'cz' },
};

export const getTeamInfo = (name) => TEAM_TRANSLATIONS[name] || { cn: name || '待定', code: null };
export const getTeamDisplayName = (name) => getTeamInfo(name).cn;
export const getTeamCountryCode = (name) => getTeamInfo(name).code;

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

export const TIME_PENDING_LABEL = '時間待確認';

export const formatMatchTaiwanTime = (matchOrLocalDate) => {
  if (!matchOrLocalDate) return '';
  if (typeof matchOrLocalDate !== 'object') {
    return toTaiwanTime(matchOrLocalDate);
  }
  if (matchOrLocalDate.kickoff_utc) {
    return formatTaiwanTime(matchOrLocalDate.kickoff_utc);
  }
  if (matchOrLocalDate.kickoff_status === 'local_time_timezone_missing') {
    return TIME_PENDING_LABEL;
  }
  return toTaiwanTime(matchOrLocalDate.local_date);
};

export const formatMatchTaiwanDate = (match) => {
  const formatted = formatMatchTaiwanTime(match);
  if (!formatted || formatted === TIME_PENDING_LABEL) return formatted || '日期待定';
  return formatted.split(' ')[0] || '日期待定';
};

export const formatMatchTaiwanClock = (match) => {
  const formatted = formatMatchTaiwanTime(match);
  if (!formatted) return '—';
  if (formatted === TIME_PENDING_LABEL) return TIME_PENDING_LABEL;
  return formatted.split(' ')[1] || '—';
};

export const matchDateTimeValue = (match) => {
  if (!match) return '';
  if (typeof match !== 'object') return match || '';
  return match.kickoff_utc || match.local_date || '';
};
